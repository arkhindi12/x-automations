import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { executeAutoCommentRun, ensureAutoCommentSchedulesTable } from "../routes/auto-comments";

let schedulerInterval: NodeJS.Timeout | null = null;
const runningSchedules = new Set<number>();

function nextRunFromNow(minutes: number) {
  return new Date(Date.now() + Math.max(5, minutes) * 60_000);
}

export async function runDueAutoCommentSchedules() {
  await ensureAutoCommentSchedulesTable();
  const result = await db.execute(sql`
    SELECT * FROM auto_comment_schedules
    WHERE is_active = true
      AND (next_run IS NULL OR next_run <= NOW())
    ORDER BY COALESCE(next_run, created_at) ASC
    LIMIT 5
  `);
  const schedules = (result as any).rows ?? [];
  logger.info({ due: schedules.length }, "Auto comment scheduler tick");

  for (const schedule of schedules) {
    const id = Number(schedule.id);
    if (runningSchedules.has(id)) continue;
    runningSchedules.add(id);

    void (async () => {
      try {
        await db.execute(sql`UPDATE auto_comment_schedules SET status = 'running', last_run = NOW(), runs_count = runs_count + 1 WHERE id = ${id}`);
        const runResult = await executeAutoCommentRun({
          accountId: Number(schedule.account_id),
          keyword: String(schedule.keyword ?? ""),
          commentText: String(schedule.comment_text ?? ""),
          linkRotator: String(schedule.link_rotator ?? ""),
          maxComments: Number(schedule.max_comments ?? 1),
          delaySeconds: Number(schedule.delay_seconds ?? 30),
          aiEnabled: Boolean(schedule.ai_enabled),
          aiProvider: schedule.ai_provider === "groq" ? "groq" : "openai",
          aiApiKey: String(schedule.ai_api_key ?? ""),
          aiPrompt: String(schedule.ai_prompt ?? ""),
          dryRun: false,
        });

        const latest = await db.execute(sql`SELECT is_active FROM auto_comment_schedules WHERE id = ${id}`);
        const stillActive = Boolean(((latest as any).rows ?? [])[0]?.is_active);
        const nextRun = stillActive ? nextRunFromNow(Number(schedule.schedule_minutes ?? 60)) : null;
        await db.execute(sql`
          UPDATE auto_comment_schedules
          SET status = 'idle', next_run = ${nextRun}, last_error = NULL
          WHERE id = ${id}
        `);
        logger.info({ scheduleId: id, attempted: runResult.attempted }, "Auto comment schedule completed");
      } catch (error) {
        logger.error({ scheduleId: id, err: error }, "Auto comment schedule failed");
        await db.execute(sql`
          UPDATE auto_comment_schedules
          SET status = 'error', next_run = ${nextRunFromNow(Number(schedule.schedule_minutes ?? 60))}, last_error = ${error instanceof Error ? error.message : String(error)}
          WHERE id = ${id}
        `);
      } finally {
        runningSchedules.delete(id);
      }
    })();
  }
}

export function startAutoCommentScheduler() {
  if (schedulerInterval) return;
  schedulerInterval = setInterval(() => {
    void runDueAutoCommentSchedules();
  }, 60_000);
  void runDueAutoCommentSchedules();
  logger.info("Auto comment scheduler started (checks every 60 seconds)");
}
