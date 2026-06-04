import { Queue } from "bullmq";
import { redisConnectionOpts } from "./connection";

/**
 * Queue definitions for all background tasks.
 * 
 * Architecture:
 * - automation-jobs: Grab media from targets (per job)
 * - mass-grab: Scheduled mass grab (per schedule)
 * - publish-posts: Publish due posts to X
 * - video-processing: Upload to Dood/Streamtape, OCR, smart-extract
 */

// Main automation job queue (grab from targets)
export const automationQueue = new Queue("automation-jobs", {
  connection: redisConnectionOpts,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

// Mass grab schedule queue
export const massGrabQueue = new Queue("mass-grab", {
  connection: redisConnectionOpts,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

// Post publisher queue
export const publishQueue = new Queue("publish-posts", {
  connection: redisConnectionOpts,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

/**
 * Enqueue a job run (called by scheduler or manual trigger).
 * Uses jobId as deduplication key — won't enqueue if same job is already queued/active.
 */
export async function enqueueAutomationJob(jobId: number, jobName: string) {
  await automationQueue.add(
    `job-${jobId}`,
    { jobId, jobName },
    { jobId: `automation-${jobId}` } // Dedupe: only 1 instance per job
  );
}

/**
 * Enqueue mass grab schedule run.
 */
export async function enqueueMassGrab(scheduleId: number) {
  await massGrabQueue.add(
    `schedule-${scheduleId}`,
    { scheduleId },
    { jobId: `massgrab-${scheduleId}` }
  );
}

/**
 * Enqueue post publishing batch.
 * Called periodically by the scheduler repeatable job.
 */
export async function enqueuePublishPosts() {
  await publishQueue.add("publish-batch", {}, { jobId: `publish-${Date.now()}` });
}

/**
 * Setup repeatable schedulers (called once at startup).
 * These replace the old setInterval-based schedulers.
 */
export async function setupRepeatableJobs() {
  // Check for due automation jobs every 2 minutes
  await automationQueue.add("check-due-jobs", { type: "scheduler" }, {
    repeat: { every: 120_000 },
    jobId: "scheduler-automation",
  });

  // Check for due mass grab schedules every 2 minutes
  await massGrabQueue.add("check-due-schedules", { type: "scheduler" }, {
    repeat: { every: 120_000 },
    jobId: "scheduler-massgrab",
  });

  // Publish due posts every 60 seconds
  await publishQueue.add("check-due-posts", { type: "scheduler" }, {
    repeat: { every: 60_000 },
    jobId: "scheduler-publish",
  });
}
