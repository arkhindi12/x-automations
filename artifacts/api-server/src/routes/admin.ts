import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "./auth";

const router = Router();

// GET /api/admin/stats
router.get("/stats", requireAdmin, async (req, res) => {
  try {
    const userCountRes = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
    const activeCountRes = await db.execute(sql`SELECT COUNT(*) as count FROM users WHERE is_active = true`);
    const mediaCountRes = await db.execute(sql`SELECT COUNT(*) as count FROM media`);
    const jobCountRes = await db.execute(sql`SELECT COUNT(*) as count FROM jobs`);

    const getCount = (r: any) => Number(((r as any).rows ?? r)[0]?.count ?? 0);

    return res.json({
      totalUsers: getCount(userCountRes),
      activeUsers: getCount(activeCountRes),
      totalMedia: getCount(mediaCountRes),
      totalJobs: getCount(jobCountRes),
      revenue: "-",
    });
  } catch (error) {
    console.error("[ADMIN] Stats error:", error);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /api/admin/users
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      plan: usersTable.plan,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(usersTable.id);

    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

// PATCH /api/admin/users/:id/role
router.patch("/users/:id/role", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role } = req.body as { role?: string };
    if (!role || !["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    await db.update(usersTable).set({ role }).where(eq(usersTable.id, id));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update role" });
  }
});

// PATCH /api/admin/users/:id/status
router.patch("/users/:id/status", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body as { isActive?: boolean };
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "Invalid status" });
    }
    await db.update(usersTable).set({ isActive }).where(eq(usersTable.id, id));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update status" });
  }
});

// PATCH /api/admin/users/:id/plan
router.patch("/users/:id/plan", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { plan } = req.body as { plan?: string };
    const validPlans = ["", "starter", "pro", "enterprise"];
    if (plan !== undefined && !validPlans.includes(plan)) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    await db.update(usersTable).set({ plan: plan || null }).where(eq(usersTable.id, id));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update plan" });
  }
});

export default router;
