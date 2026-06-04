/**
 * Worker entry point — runs as a separate process from the API server.
 * 
 * This process handles all background job processing:
 * - Automation jobs (grab media from targets)
 * - Mass grab schedules
 * - Post publishing
 * 
 * Start with: node dist/worker.mjs
 */

import { logger } from "./lib/logger";
import { setupRepeatableJobs } from "./lib/queue/queues";
import "./lib/queue/workers"; // Import to start workers

async function main() {
  logger.info("Worker process starting...");

  // Setup repeatable scheduler jobs
  await setupRepeatableJobs();

  logger.info("Worker process ready — processing jobs from Redis queue");
  logger.info("Queues: automation-jobs (concurrency: 2), mass-grab (concurrency: 1), publish-posts (concurrency: 1)");
}

main().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Worker received SIGTERM, shutting down...");
  const { automationWorker, massGrabWorker, publishWorker } = await import("./lib/queue/workers");
  await automationWorker.close();
  await massGrabWorker.close();
  await publishWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Worker received SIGINT, shutting down...");
  const { automationWorker, massGrabWorker, publishWorker } = await import("./lib/queue/workers");
  await automationWorker.close();
  await massGrabWorker.close();
  await publishWorker.close();
  process.exit(0);
});
