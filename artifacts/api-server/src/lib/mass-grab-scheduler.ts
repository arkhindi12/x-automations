import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { ensureMassGrabSchedulesTable } from "../routes/mass-grab-schedules";

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

function nextRunFromNow(minutes: number) {
  return new Date(Date.now() + Math.max(5, minutes) * 60_000);
}

/**
 * Process ONE schedule at a time (serial) to avoid overloading 2GB/2core server.
 * Each URL is processed individually with a delay between them.
 */
export async function runDueMassGrabSchedules() {
  if (isRunning) {
    logger.debug("Mass grab scheduler already running, skipping tick");
    return;
  }
  isRunning = true;

  try {
    await ensureMassGrabSchedulesTable();

    // Only pick 1 schedule at a time — serial execution to prevent resource exhaustion
    const result = await db.execute(sql`
      SELECT * FROM mass_grab_schedules
      WHERE is_active = true
        AND status != 'running'
        AND (next_run IS NULL OR next_run <= NOW())
      ORDER BY COALESCE(next_run, created_at) ASC
      LIMIT 1
    `);
    const schedules = (result as any).rows ?? [];
    if (schedules.length === 0) return;

    const schedule = schedules[0];
    const id = Number(schedule.id);

    await db.execute(sql`UPDATE mass_grab_schedules SET status = 'running', last_run = NOW(), runs_count = runs_count + 1 WHERE id = ${id}`);

    // Split URLs into batches of 3 (smaller batches = less memory pressure)
    const allUrls = String(schedule.status_urls).split(/\n+/).map((u: string) => u.trim()).filter(Boolean);
    const batchSize = 3;
    const batches: string[][] = [];
    for (let i = 0; i < allUrls.length; i += batchSize) {
      batches.push(allUrls.slice(i, i + batchSize));
    }

    logger.info({ scheduleId: id, totalUrls: allUrls.length, batches: batches.length }, "Starting mass grab schedule (serial mode)");

    let totalInserted = 0;
    let totalUploaded = 0;
    let totalFailed = 0;

    // Process each batch sequentially — one at a time
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      logger.info({ scheduleId: id, batchIndex: batchIndex + 1, batchSize: batch.length }, "Processing batch");

      // Check if schedule was deactivated mid-run
      const midCheck = await db.execute(sql`SELECT is_active FROM mass_grab_schedules WHERE id = ${id}`);
      if (!Boolean(((midCheck as any).rows ?? [])[0]?.is_active)) {
        logger.info({ scheduleId: id }, "Schedule deactivated mid-run, stopping");
        break;
      }

      let batchResult: { inserted?: number; uploaded?: number; failed?: number } | null = null;
      let lastBatchError: string | null = null;

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetch(`http://127.0.0.1:${process.env.PORT || 5002}/api/media/mass-grab-x`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountId: Number(schedule.account_id),
              statusUrls: batch.join("\n"),
              uploadToStreamtape: Boolean(schedule.upload_to_streamtape),
              uploadToDood: Boolean(schedule.upload_to_dood),
              scanReplies: Boolean(schedule.scan_replies),
              maxTweetsPerProfile: Math.min(Number(schedule.max_tweets_per_profile) || 5, 20),
              skipOcr: true, // Skip OCR during scheduled runs to reduce load
              lowMemoryMode: true, // Signal handler to use lighter dedupe
            }),
            signal: AbortSignal.timeout(15 * 60 * 1000), // 15 min timeout (was 30)
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          batchResult = await response.json() as { inserted?: number; uploaded?: number; failed?: number };
          lastBatchError = null;
          break;
        } catch (error) {
          lastBatchError = error instanceof Error ? error.message : String(error);
          logger.warn({ scheduleId: id, batchIndex: batchIndex + 1, attempt, err: lastBatchError }, "Mass grab batch attempt failed");
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 5_000));
        }
      }

      if (!batchResult) {
        totalFailed++;
        logger.warn({ scheduleId: id, batchIndex: batchIndex + 1, err: lastBatchError }, "Mass grab batch skipped after retries");
        continue;
      }

      totalInserted += batchResult.inserted || 0;
      totalUploaded += batchResult.uploaded || 0;
      totalFailed += batchResult.failed || 0;

      // Delay between batches — 15s (reduced from 30s since batches are smaller)
      if (batchIndex < batches.length - 1) {
        logger.info({ scheduleId: id, batchIndex: batchIndex + 1 }, "Waiting 15s before next batch");
        await new Promise(resolve => setTimeout(resolve, 15_000));
      }
    }

    const latest = await db.execute(sql`SELECT is_active FROM mass_grab_schedules WHERE id = ${id}`);
    const stillActive = Boolean(((latest as any).rows ?? [])[0]?.is_active);
    const nextRun = stillActive ? nextRunFromNow(Number(schedule.schedule_minutes ?? 60)) : null;
    await db.execute(sql`
      UPDATE mass_grab_schedules
      SET status = 'idle', next_run = ${nextRun}, last_error = NULL
      WHERE id = ${id}
    `);
    logger.info({ scheduleId: id, totalInserted, totalUploaded, totalFailed, batches: batches.length }, "Mass grab schedule completed");
  } catch (error) {
    logger.error({ err: error }, "Mass grab scheduler tick failed");
    // Try to reset any stuck 'running' schedules
    try {
      await db.execute(sql`
        UPDATE mass_grab_schedules
        SET status = 'error', last_error = ${error instanceof Error ? error.message : String(error)}
        WHERE status = 'running'
      `);
    } catch {}
  } finally {
    isRunning = false;
  }
}

export function startMassGrabScheduler() {
  if (schedulerInterval) return;
  schedulerInterval = setInterval(() => {
    void runDueMassGrabSchedules();
  }, 60_000);
  void runDueMassGrabSchedules();
  logger.info("Mass grab scheduler started (checks every 60 seconds, serial mode)");
}
