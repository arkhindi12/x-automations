import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Run a single mass grab schedule by ID.
 * Called by the BullMQ worker — isolated execution.
 */
export async function runSingleMassGrabSchedule(scheduleId: number): Promise<{ success: boolean; inserted?: number; uploaded?: number; error?: string }> {
  try {
    const result = await db.execute(sql`SELECT * FROM mass_grab_schedules WHERE id = ${scheduleId}`);
    const schedule = ((result as any).rows ?? [])[0];
    if (!schedule) return { success: false, error: "Schedule not found" };
    if (!schedule.is_active) return { success: false, error: "Schedule inactive" };

    await db.execute(sql`UPDATE mass_grab_schedules SET status = 'running', last_run = NOW(), runs_count = runs_count + 1 WHERE id = ${scheduleId}`);

    const allUrls = String(schedule.status_urls).split(/\n+/).map((u: string) => u.trim()).filter(Boolean);
    const batchSize = 3;
    const batches: string[][] = [];
    for (let i = 0; i < allUrls.length; i += batchSize) {
      batches.push(allUrls.slice(i, i + batchSize));
    }

    logger.info({ scheduleId, totalUrls: allUrls.length, batches: batches.length }, "[MassGrabRunner] Starting");

    let totalInserted = 0;
    let totalUploaded = 0;
    let totalFailed = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Check if deactivated mid-run
      const midCheck = await db.execute(sql`SELECT is_active FROM mass_grab_schedules WHERE id = ${scheduleId}`);
      if (!Boolean(((midCheck as any).rows ?? [])[0]?.is_active)) {
        logger.info({ scheduleId }, "[MassGrabRunner] Deactivated mid-run, stopping");
        break;
      }

      let batchResult: { inserted?: number; uploaded?: number; failed?: number } | null = null;

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
              skipOcr: true,
              lowMemoryMode: true,
            }),
            signal: AbortSignal.timeout(15 * 60 * 1000),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Unknown" })) as { error?: string };
            throw new Error(errorData.error || `HTTP ${response.status}`);
          }

          batchResult = await response.json() as { inserted?: number; uploaded?: number; failed?: number };
          break;
        } catch (error) {
          logger.warn({ scheduleId, batchIndex: batchIndex + 1, attempt, err: error instanceof Error ? error.message : String(error) }, "[MassGrabRunner] Batch attempt failed");
          if (attempt < 2) await new Promise(r => setTimeout(r, 5_000));
        }
      }

      if (batchResult) {
        totalInserted += batchResult.inserted || 0;
        totalUploaded += batchResult.uploaded || 0;
      } else {
        totalFailed++;
      }

      // Delay between batches
      if (batchIndex < batches.length - 1) {
        await new Promise(r => setTimeout(r, 15_000));
      }
    }

    // Update schedule status
    const nextMinutes = Number(schedule.schedule_minutes ?? 60);
    const nextRun = new Date(Date.now() + Math.max(5, nextMinutes) * 60_000);
    await db.execute(sql`
      UPDATE mass_grab_schedules
      SET status = 'idle', next_run = ${nextRun}, last_error = NULL
      WHERE id = ${scheduleId}
    `);

    logger.info({ scheduleId, totalInserted, totalUploaded, totalFailed }, "[MassGrabRunner] Completed");
    return { success: true, inserted: totalInserted, uploaded: totalUploaded };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ scheduleId, err: error }, "[MassGrabRunner] Failed");

    try {
      const nextRun = new Date(Date.now() + 60 * 60_000);
      await db.execute(sql`
        UPDATE mass_grab_schedules
        SET status = 'error', next_run = ${nextRun}, last_error = ${errorMsg}
        WHERE id = ${scheduleId}
      `);
    } catch {}

    return { success: false, error: errorMsg };
  }
}
