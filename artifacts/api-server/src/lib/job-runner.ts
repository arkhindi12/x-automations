import { db } from "@workspace/db";
import { jobsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { runJobById } from "../routes/jobs";
import { logger } from "./logger";

/**
 * Run a single automation job by ID.
 * Called by the BullMQ worker — isolated execution.
 */
export async function runSingleJob(jobId: number): Promise<{ success: boolean; error?: string }> {
  try {
    // Check job exists and is active
    const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
    if (!job) return { success: false, error: "Job not found" };
    if (!job.isActive) return { success: false, error: "Job is inactive" };
    if (job.status === "running") return { success: false, error: "Job already running" };

    logger.info({ jobId, jobName: job.name }, "[JobRunner] Starting job");
    await runJobById(jobId);
    logger.info({ jobId, jobName: job.name }, "[JobRunner] Job completed");

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ jobId, err: error }, "[JobRunner] Job failed");

    // Reset job status if it got stuck
    try {
      await db.update(jobsTable).set({ status: "idle" }).where(eq(jobsTable.id, jobId));
    } catch {}

    return { success: false, error: errorMsg };
  }
}

/**
 * Reset stale running jobs (stuck for > 90 minutes).
 */
export async function resetStaleJobs() {
  await db.update(jobsTable)
    .set({ status: "idle" })
    .where(sql`${jobsTable.status} = 'running' AND ${jobsTable.lastRun} IS NOT NULL AND ${jobsTable.lastRun} < NOW() - INTERVAL '90 minutes'`);
}
