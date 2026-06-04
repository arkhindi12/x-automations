import app from "./app";
import { startAutomationScheduler } from "./lib/automation-scheduler";
import { startHealthCheckScheduler } from "./lib/health-check-scheduler";
import { startUnifiedScheduler } from "./lib/unified-scheduler";
import { startBackgroundWorker } from "./lib/background-worker";
import { ensureMediaIndexes } from "./lib/ensure-media-indexes";
import { setupRepeatableJobs } from "./lib/queue/queues";
import { logger } from "./lib/logger";
import { validateEnv } from "./lib/env-validator";

// Validate environment variables at startup
try {
  const env = validateEnv();
  logger.info({ env: env.NODE_ENV }, "Environment validated successfully");
} catch (error) {
  logger.error({ err: error }, "Environment validation failed");
  console.error("\n" + (error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(1);
}

const port = Number(process.env.PORT);
const useQueue = process.env.USE_QUEUE === "true";

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, useQueue }, "Server listening");
  void ensureMediaIndexes();

  if (useQueue) {
    // Queue mode: automation/publish handled by worker process via BullMQ.
    // startUnifiedScheduler always runs in API process for auto-comment + warm-account
    // (these schedulers are not registered in the BullMQ worker yet).
    startUnifiedScheduler();
    void setupRepeatableJobs().then(() => {
      logger.info("Queue repeatable jobs configured (worker handles processing)");
    }).catch((err) => {
      logger.error({ err }, "Failed to setup queue repeatable jobs, falling back to legacy schedulers");
      startAutomationScheduler();
      startHealthCheckScheduler();
      startBackgroundWorker();
    });
  } else {
    // Legacy mode: everything in one process (backward compatible)
    startAutomationScheduler();
    startHealthCheckScheduler();
    startUnifiedScheduler();
    startBackgroundWorker();
  }
});
