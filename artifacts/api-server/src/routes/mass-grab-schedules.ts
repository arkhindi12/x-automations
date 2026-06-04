import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { jobActionLimiter } from "../lib/rate-limiter";

const router = Router();

export async function ensureMassGrabSchedulesTable() {
  await db.execute(sql`SELECT pg_advisory_lock(500202)`);
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF to_regclass('public.mass_grab_schedules') IS NULL THEN
          DROP SEQUENCE IF EXISTS mass_grab_schedules_id_seq;
          CREATE TABLE mass_grab_schedules (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL,
            status_urls TEXT NOT NULL,
            upload_to_streamtape BOOLEAN NOT NULL DEFAULT FALSE,
            upload_to_dood BOOLEAN NOT NULL DEFAULT FALSE,
            scan_replies BOOLEAN NOT NULL DEFAULT TRUE,
            max_tweets_per_profile INTEGER NOT NULL DEFAULT 5,
            schedule_minutes INTEGER NOT NULL DEFAULT 60,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            status TEXT NOT NULL DEFAULT 'idle',
            runs_count INTEGER NOT NULL DEFAULT 0,
            last_run TIMESTAMP,
            next_run TIMESTAMP,
            last_error TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        END IF;
      END $$;
    `);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(500202)`);
  }
}

router.get("/", async (_req, res) => {
  try {
    await ensureMassGrabSchedulesTable();
    const result = await db.execute(sql`
      SELECT s.*, a.username AS account_username
      FROM mass_grab_schedules s
      LEFT JOIN accounts a ON a.id = s.account_id
      ORDER BY s.created_at DESC
    `);
    return res.json({ ok: true, schedules: (result as any).rows ?? [] });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to list schedules." });
  }
});

router.post("/", jobActionLimiter, async (req, res) => {
  try {
    await ensureMassGrabSchedulesTable();
    const accountId = Number(req.body?.accountId);
    const statusUrls = String(req.body?.statusUrls ?? "").trim();
    const uploadToStreamtape = Boolean(req.body?.uploadToStreamtape);
    const uploadToDood = Boolean(req.body?.uploadToDood);
    const scanReplies = Boolean(req.body?.scanReplies ?? true);
    const maxTweetsPerProfile = Math.max(1, Math.min(Number(req.body?.maxTweetsPerProfile) || 5, 50));
    const scheduleMinutes = Math.max(5, Math.min(Number(req.body?.scheduleMinutes) || 60, 1440));

    if (!accountId || Number.isNaN(accountId)) return res.status(400).json({ ok: false, error: "Account ID is required." });
    if (!statusUrls) return res.status(400).json({ ok: false, error: "Status URLs are required." });

    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) return res.status(404).json({ ok: false, error: "Account not found." });
    if (account.authMode !== "cookies") return res.status(400).json({ ok: false, error: "Mass grab schedule requires cookie auth account." });

    const nextRun = new Date(Date.now() + scheduleMinutes * 60_000);
    const result = await db.execute(sql`
      INSERT INTO mass_grab_schedules (account_id, status_urls, upload_to_streamtape, upload_to_dood, scan_replies, max_tweets_per_profile, schedule_minutes, next_run)
      VALUES (${accountId}, ${statusUrls}, ${uploadToStreamtape}, ${uploadToDood}, ${scanReplies}, ${maxTweetsPerProfile}, ${scheduleMinutes}, ${nextRun})
      RETURNING *
    `);
    return res.json({ ok: true, schedule: ((result as any).rows ?? [])[0] });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to create schedule." });
  }
});

router.patch("/:id", jobActionLimiter, async (req, res) => {
  try {
    await ensureMassGrabSchedulesTable();
    const id = Number(req.params.id);
    const current = await db.execute(sql`SELECT * FROM mass_grab_schedules WHERE id = ${id}`);
    const schedule = ((current as any).rows ?? [])[0];
    if (!schedule) return res.status(404).json({ ok: false, error: "Schedule not found." });
    if (schedule.status !== "idle") return res.status(400).json({ ok: false, error: "Only idle schedules can be edited." });

    const statusUrls = String(req.body?.statusUrls ?? "").trim();
    if (!statusUrls) return res.status(400).json({ ok: false, error: "Status URLs are required." });

    const result = await db.execute(sql`
      UPDATE mass_grab_schedules
      SET status_urls = ${statusUrls}
      WHERE id = ${id}
      RETURNING *
    `);
    return res.json({ ok: true, schedule: ((result as any).rows ?? [])[0] });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to update schedule." });
  }
});

router.post("/:id/toggle", async (req, res) => {
  try {
    await ensureMassGrabSchedulesTable();
    const id = Number(req.params.id);
    const current = await db.execute(sql`SELECT * FROM mass_grab_schedules WHERE id = ${id}`);
    const schedule = ((current as any).rows ?? [])[0];
    if (!schedule) return res.status(404).json({ ok: false, error: "Schedule not found." });
    const nextActive = !schedule.is_active;
    const nextRun = nextActive ? new Date(Date.now() + Number(schedule.schedule_minutes) * 60_000) : null;
    const result = await db.execute(sql`
      UPDATE mass_grab_schedules
      SET is_active = ${nextActive}, status = CASE WHEN status = 'running' THEN status ELSE 'idle' END, next_run = ${nextRun}
      WHERE id = ${id}
      RETURNING *
    `);
    return res.json({ ok: true, schedule: ((result as any).rows ?? [])[0] });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to toggle schedule." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await ensureMassGrabSchedulesTable();
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM mass_grab_schedules WHERE id = ${id}`);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to delete schedule." });
  }
});

export default router;
