import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

let workerInterval: NodeJS.Timeout | null = null;
const runningJobs = new Set<number>();

export type BackgroundJob = {
  id: number;
  type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  payload: any;
  result?: any;
  progress?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
};

export async function createBackgroundJob(type: string, payload: any): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO background_jobs (type, status, payload)
    VALUES (${type}, 'pending', ${JSON.stringify(payload)})
    RETURNING id
  `);
  const jobId = ((result as any).rows?.[0]?.id) as number;
  logger.info({ jobId, type }, "Background job created");
  return jobId;
}

export async function getBackgroundJob(jobId: number): Promise<BackgroundJob | null> {
  const result = await db.execute(sql`SELECT * FROM background_jobs WHERE id = ${jobId}`);
  const row = ((result as any).rows?.[0]) as any;
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: row.payload,
    result: row.result,
    progress: row.progress,
    error: row.error,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    updatedAt: new Date(row.updated_at),
  };
}

export async function updateJobProgress(jobId: number, progress: string) {
  await db.execute(sql`
    UPDATE background_jobs
    SET progress = ${progress}, updated_at = NOW()
    WHERE id = ${jobId}
  `);
}

export async function updateJobStatus(jobId: number, status: BackgroundJob["status"], result?: any, error?: string) {
  const completedAt = status === "completed" || status === "failed" ? sql`NOW()` : sql`NULL`;
  await db.execute(sql`
    UPDATE background_jobs
    SET status = ${status},
        result = ${result ? JSON.stringify(result) : sql`NULL`},
        error = ${error || sql`NULL`},
        completed_at = ${completedAt},
        updated_at = NOW()
    WHERE id = ${jobId}
  `);
}

async function processJob(job: BackgroundJob, handler: (job: BackgroundJob) => Promise<any>) {
  const jobId = job.id;
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  try {
    await db.execute(sql`
      UPDATE background_jobs
      SET status = 'running', started_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}
    `);

    const result = await handler(job);

    await updateJobStatus(jobId, "completed", result);
    logger.info({ jobId, type: job.type }, "Background job completed");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await updateJobStatus(jobId, "failed", null, errorMsg);
    logger.error({ jobId, type: job.type, err: error }, "Background job failed");
  } finally {
    runningJobs.delete(jobId);
  }
}

export function registerJobHandler(type: string, handler: (job: BackgroundJob) => Promise<any>) {
  jobHandlers.set(type, handler);
}

const jobHandlers = new Map<string, (job: BackgroundJob) => Promise<any>>();

async function processNextJobs() {
  try {
    const result = await db.execute(sql`
      SELECT * FROM background_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 5
    `);

    const jobs = ((result as any).rows ?? []) as any[];

    for (const row of jobs) {
      const job: BackgroundJob = {
        id: row.id,
        type: row.type,
        status: row.status,
        payload: row.payload,
        result: row.result,
        progress: row.progress,
        error: row.error,
        createdAt: new Date(row.created_at),
        startedAt: row.started_at ? new Date(row.started_at) : undefined,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        updatedAt: new Date(row.updated_at),
      };

      const handler = jobHandlers.get(job.type);
      if (!handler) {
        logger.warn({ jobId: job.id, type: job.type }, "No handler registered for job type");
        await updateJobStatus(job.id, "failed", null, "No handler registered");
        continue;
      }

      void processJob(job, handler);
    }
  } catch (error) {
    logger.error({ err: error }, "Error processing background jobs");
  }
}

export function startBackgroundWorker() {
  if (workerInterval) return;

  // Register handlers
  registerJobHandler("mass-grab-x", async (job) => {
    const port = process.env.PORT || "5002";
    const progressId = `background-${job.id}`;
    await updateJobProgress(job.id, `Running mass grab in background. Progress ID: ${progressId}`);

    const response = await fetch(`http://127.0.0.1:${port}/api/media/mass-grab-x`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...job.payload,
        background: false,
        progressId,
      }),
      signal: AbortSignal.timeout(24 * 60 * 60 * 1000), // Allow long mass-grab runs.
    });

    const data = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok || !data) {
      throw new Error(data?.error || `Mass grab failed with HTTP ${response.status}`);
    }
    return data;
  });

  workerInterval = setInterval(() => {
    void processNextJobs();
  }, 5000); // Check every 5 seconds
  void processNextJobs(); // Run immediately
  logger.info("Background worker started (checks every 5 seconds)");
}

export function stopBackgroundWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info("Background worker stopped");
  }
}
