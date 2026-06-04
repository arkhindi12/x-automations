import { db } from "@workspace/db";
import { jobsTable, settingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { runJobById } from "../routes/jobs";
import { publishDuePosts } from "./post-publisher";
import { logger, systemLogger, jobLogger } from "./structured-logger";

let schedulerStarted = false;
let jobsRunning = false;
let cachedTimezoneOffset: number | null = null;

const TIMEZONE_OFFSETS: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
  "Asia/Singapore": 8,
  "Asia/Kuala_Lumpur": 8,
  "Asia/Bangkok": 7,
  "Asia/Manila": 8,
  "Asia/Tokyo": 9,
  "Asia/Seoul": 9,
  "Asia/Hong_Kong": 8,
  "UTC": 0,
};

async function getTimezoneOffset(): Promise<number> {
  if (cachedTimezoneOffset !== null) return cachedTimezoneOffset;
  
  try {
    const [settings] = await db.select({ timezone: settingsTable.timezone }).from(settingsTable).where(eq(settingsTable.id, 1));
    const timezone = settings?.timezone || "Asia/Jakarta";
    cachedTimezoneOffset = TIMEZONE_OFFSETS[timezone] || 7;
    return cachedTimezoneOffset;
  } catch {
    return 7; // Default to WIB
  }
}

function getInitialRunAt(job: typeof jobsTable.$inferSelect) {
  if (job.nextRun) return job.nextRun;
  if (job.scheduleType === "once") {
    const scheduled = new Date(job.scheduleValue);
    return Number.isNaN(scheduled.getTime()) ? new Date() : scheduled;
  }
  return new Date();
}

async function resetStaleRunningJobs() {
  // If server was restarted or an upload/extractor hung, the DB can keep status='running'.
  // Reset jobs that have been running for more than 90 minutes so scheduler can continue.
  await db.update(jobsTable)
    .set({ status: "idle" })
    .where(sql`${jobsTable.status} = 'running' AND ${jobsTable.lastRun} IS NOT NULL AND ${jobsTable.lastRun} < NOW() - INTERVAL '90 minutes'`);
}

async function runDueJobs() {
  if (jobsRunning) return;
  jobsRunning = true;

  try {
    await resetStaleRunningJobs();
    const jobs = await db.select().from(jobsTable).where(eq(jobsTable.isActive, true)).orderBy(jobsTable.createdAt);
    const now = Date.now(); // Use timestamp for accurate comparison
    const timezoneOffset = await getTimezoneOffset();

    logger.info({ activeJobs: jobs.length }, "Checking due jobs");

    for (const job of jobs) {
      if (job.status === "running") {
        logger.info({ jobId: job.id, jobName: job.name }, "Job already running, skipping");
        continue;
      }
      
      const nextRunTime = getInitialRunAt(job);
      const nextRunTimestamp = nextRunTime.getTime();

      // TZ=Asia/Jakarta is set on the process, so node-postgres round-trips
      // timestamp without time zone correctly. No manual offset correction needed.
      const isDue = nextRunTimestamp <= now;
      
      logger.info({ 
        jobId: job.id, 
        jobName: job.name, 
        nextRun: nextRunTime.toISOString(), 
        now: new Date(now).toISOString(),
        isDue 
      }, "Job check");
      
      if (!isDue) continue;

      logger.info({ jobId: job.id, jobName: job.name }, "Running due job");
      try {
        await runJobById(job.id);
      } catch (error) {
        jobLogger.failed(job.id, error instanceof Error ? error.message : String(error), 0);
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Job scheduler failed");
  } finally {
    jobsRunning = false;
  }
}

export function startAutomationScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    await runDueJobs();
    await publishDuePosts();
  };

  setTimeout(() => {
    void tick();
  }, 5000);
  setInterval(() => {
    void tick();
  }, 120_000);

  systemLogger.schedulerStarted();
}