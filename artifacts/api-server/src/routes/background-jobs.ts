import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createBackgroundJob } from "../lib/background-worker";

const router = Router();

export { createBackgroundJob as enqueueJob };

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const status = req.query.status as string | undefined;

    let query = sql`SELECT * FROM background_jobs`;
    if (status && ["pending", "running", "completed", "failed", "cancelled"].includes(status)) {
      query = sql`SELECT * FROM background_jobs WHERE status = ${status}`;
    }
    query = sql`${query} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const result = await db.execute(query);
    const jobs = (result as any).rows ?? [];
    return res.json({ ok: true, jobs });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to list jobs." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.execute(sql`SELECT * FROM background_jobs WHERE id = ${id}`);
    const job = ((result as any).rows ?? [])[0];
    if (!job) return res.status(404).json({ ok: false, error: "Job not found." });
    return res.json({ ok: true, job });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to get job." });
  }
});

router.post("/:id/cancel", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.execute(sql`
      UPDATE background_jobs 
      SET status = 'cancelled', updated_at = NOW() 
      WHERE id = ${id} AND status IN ('pending', 'running')
      RETURNING *
    `);
    const job = ((result as any).rows ?? [])[0];
    if (!job) return res.status(404).json({ ok: false, error: "Job not found or already completed." });
    return res.json({ ok: true, job });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to cancel job." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM background_jobs WHERE id = ${id}`);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to delete job." });
  }
});

export default router;
