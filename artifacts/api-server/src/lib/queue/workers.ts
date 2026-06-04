import { Worker, Job } from "bullmq";
import { redisConnectionOpts } from "./connection";
import { db } from "@workspace/db";
import { jobsTable, accountsTable, settingsTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { logger } from "../logger";
import { enqueueAutomationJob, enqueueMassGrab } from "./queues";

/**
 * Worker process — handles all background job processing.
 * 
 * Concurrency limits:
 * - automation-jobs: 2 concurrent (1 job at a time per account via lock)
 * - mass-grab: 1 concurrent (serial to avoid overload)
 * - publish-posts: 3 concurrent (fast, just API calls)
 * 
 * This runs as a SEPARATE process from the API server.
 */

// ============ AUTOMATION JOBS WORKER ============

const automationWorker = new Worker("automation-jobs", async (job: Job) => {
  if (job.data.type === "scheduler") {
    // This is the repeatable scheduler — find due jobs and enqueue them
    await checkAndEnqueueDueJobs();
    return { scheduled: true };
  }

  // Process actual automation job
  const { jobId } = job.data as { jobId: number };
  logger.info({ jobId, bullJobId: job.id }, "[Worker] Processing automation job");

  // Dynamic import to avoid circular deps and keep worker lightweight at startup
  const { runSingleJob } = await import("../job-runner");
  const result = await runSingleJob(jobId);
  
  logger.info({ jobId, result }, "[Worker] Automation job completed");
  return result;
}, {
  connection: redisConnectionOpts,
  concurrency: 2, // Max 2 jobs running at same time
  limiter: {
    max: 5,
    duration: 60_000, // Max 5 jobs per minute (rate limit)
  },
});

// ============ MASS GRAB WORKER ============

const massGrabWorker = new Worker("mass-grab", async (job: Job) => {
  if (job.data.type === "scheduler") {
    await checkAndEnqueueDueMassGrabs();
    return { scheduled: true };
  }

  const { scheduleId } = job.data as { scheduleId: number };
  logger.info({ scheduleId, bullJobId: job.id }, "[Worker] Processing mass grab schedule");

  const { runSingleMassGrabSchedule } = await import("../mass-grab-runner");
  const result = await runSingleMassGrabSchedule(scheduleId);

  logger.info({ scheduleId, result }, "[Worker] Mass grab schedule completed");
  return result;
}, {
  connection: redisConnectionOpts,
  concurrency: 1, // Only 1 mass grab at a time (heavy operation)
});

// ============ PUBLISH POSTS WORKER ============

const publishWorker = new Worker("publish-posts", async (job: Job) => {
  if (job.data.type === "scheduler") {
    // Publish due posts directly (lightweight)
    const { publishDuePosts } = await import("../post-publisher");
    await publishDuePosts();
    return { published: true };
  }
  return {};
}, {
  connection: redisConnectionOpts,
  concurrency: 1, // Publish one batch at a time to avoid rate limits
});

// ============ SCHEDULER HELPERS ============

async function checkAndEnqueueDueJobs() {
  try {
    const now = new Date();
    const dueJobs = await db.select({
      id: jobsTable.id,
      name: jobsTable.name,
    }).from(jobsTable).where(
      and(
        eq(jobsTable.isActive, true),
        lte(jobsTable.nextRun, now),
        eq(jobsTable.status, "idle"),
      )
    );

    for (const job of dueJobs) {
      await enqueueAutomationJob(job.id, job.name);
      logger.info({ jobId: job.id, jobName: job.name }, "[Scheduler] Enqueued due automation job");
    }
  } catch (error) {
    logger.error({ err: error }, "[Scheduler] Failed to check due jobs");
  }
}

async function checkAndEnqueueDueMassGrabs() {
  try {
    // Auto-reset schedules stuck in 'running' for more than 30 minutes
    await db.execute(sql`
      UPDATE mass_grab_schedules
      SET status = 'idle'
      WHERE status = 'running'
        AND last_run IS NOT NULL
        AND last_run < NOW() - INTERVAL '30 minutes'
    `);

    const result = await db.execute(sql`
      SELECT id FROM mass_grab_schedules
      WHERE is_active = true
        AND status != 'running'
        AND (next_run IS NULL OR next_run <= NOW())
      ORDER BY COALESCE(next_run, created_at) ASC
      LIMIT 1
    `);
    const schedules = (result as any).rows ?? [];
    for (const schedule of schedules) {
      await enqueueMassGrab(Number(schedule.id));
      logger.info({ scheduleId: schedule.id }, "[Scheduler] Enqueued due mass grab");
    }
  } catch (error) {
    logger.error({ err: error }, "[Scheduler] Failed to check due mass grabs");
  }
}

// ============ ERROR HANDLERS ============

automationWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "[Worker] Automation job failed");
});

massGrabWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "[Worker] Mass grab failed");
});

publishWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "[Worker] Publish failed");
});

automationWorker.on("ready", () => logger.info("[Worker] Automation worker ready"));
massGrabWorker.on("ready", () => logger.info("[Worker] Mass grab worker ready"));
publishWorker.on("ready", () => logger.info("[Worker] Publish worker ready"));

export { automationWorker, massGrabWorker, publishWorker };
