import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { ensureWarmAccountSchedulesTable, executeWarmAccountRun } from "../routes/warm-accounts";

let schedulerInterval: NodeJS.Timeout | null = null;
const runningSchedules = new Set<number>();

function nextRunFromNow(hours: number) {
  // Add random variance ±10% to schedule (natural behavior)
  const variance = hours * 0.1;
  const randomHours = hours + (Math.random() * variance * 2 - variance);
  return new Date(Date.now() + Math.max(1, randomHours) * 3600_000);
}

export async function runDueWarmAccountSchedules() {
  await ensureWarmAccountSchedulesTable();
  const result = await db.execute(sql`
    SELECT * FROM warm_account_schedules
    WHERE is_active = true
      AND (next_run IS NULL OR next_run <= NOW())
    ORDER BY COALESCE(next_run, created_at) ASC
    LIMIT 5
  `);
  const schedules = (result as any).rows ?? [];

  for (const schedule of schedules) {
    const id = Number(schedule.id);
    if (runningSchedules.has(id)) continue;
    runningSchedules.add(id);

    void (async () => {
      try {
        await db.execute(sql`UPDATE warm_account_schedules SET status = 'running', last_run = NOW(), runs_count = runs_count + 1 WHERE id = ${id}`);
        
        const runResult = await executeWarmAccountRun({
          accountId: Number(schedule.account_id),
          actions: String(schedule.actions ?? "like,retweet"),
          keywords: String(schedule.keywords ?? ""),
          maxActionsPerRun: Number(schedule.max_actions_per_run ?? 5),
          enableAdvanced: Boolean(schedule.enable_advanced ?? true),
          startedAt: schedule.started_at || schedule.created_at,
          dryRun: false,
        });

        const latest = await db.execute(sql`SELECT is_active FROM warm_account_schedules WHERE id = ${id}`);
        const stillActive = Boolean(((latest as any).rows ?? [])[0]?.is_active);
        const nextRun = stillActive ? nextRunFromNow(Number(schedule.schedule_hours ?? 24)) : null;
        await db.execute(sql`
          UPDATE warm_account_schedules
          SET status = 'idle', next_run = ${nextRun}, last_error = NULL
          WHERE id = ${id}
        `);
        const failed = Array.isArray(runResult.results) ? runResult.results.filter((result: any) => result?.ok === false).length : 0;
        const skipped = Array.isArray(runResult.results) ? runResult.results.filter((result: any) => result?.skipped === true).length : runResult.skipped;
        logger.info({ scheduleId: id, attempted: runResult.attempted, performed: runResult.performed, failed, skipped, keyword: runResult.keyword }, "Warm account schedule completed");
      } catch (error) {
        logger.error({ scheduleId: id, err: error }, "Warm account schedule failed");
        await db.execute(sql`
          UPDATE warm_account_schedules
          SET status = 'error', next_run = ${nextRunFromNow(Number(schedule.schedule_hours ?? 24))}, last_error = ${error instanceof Error ? error.message : String(error)}
          WHERE id = ${id}
        `);
      } finally {
        runningSchedules.delete(id);
      }
    })();
  }
}

export function startWarmAccountScheduler() {
  if (schedulerInterval) return;
  schedulerInterval = setInterval(() => {
    void runDueWarmAccountSchedules();
  }, 60_000);
  void runDueWarmAccountSchedules();
  logger.info("Warm account scheduler started (checks every 60 seconds)");
}
