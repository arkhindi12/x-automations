import { logger } from "./logger";
import { runDueMassGrabSchedules } from "./mass-grab-scheduler";
import { runDueAutoCommentSchedules } from "./auto-comment-scheduler";
import { runDueWarmAccountSchedules } from "./warm-account-scheduler";

/**
 * Unified scheduler - combines all periodic tasks into a single interval
 * to reduce DB polling overhead and memory usage.
 * 
 * Runs every 120 seconds instead of 4 separate 60s intervals.
 */

let started = false;
let running = false;

async function tick() {
  if (running) return;
  running = true;

  try {
    // Run all schedulers sequentially to avoid DB connection spikes
    await runDueMassGrabSchedules();
    await runDueAutoCommentSchedules();
    await runDueWarmAccountSchedules();
  } catch (error) {
    logger.error({ err: error }, "[UnifiedScheduler] Tick failed");
  } finally {
    running = false;
  }
}

export function startUnifiedScheduler() {
  if (started) return;
  started = true;

  // Initial run after 10s (give server time to boot)
  setTimeout(() => {
    void tick();
  }, 10_000);

  // Then every 120 seconds
  setInterval(() => {
    void tick();
  }, 120_000);

  logger.info("Unified scheduler started (mass-grab + auto-comment + warm-account, every 120s)");
}
