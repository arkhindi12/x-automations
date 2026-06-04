import { Router } from "express";
import { db } from "@workspace/db";
import { affiliateLinksTable } from "@workspace/db";
import { eq, and, sql, asc } from "drizzle-orm";
import { requireAuth, getCurrentUser } from "./auth";
import crypto from "crypto";

const router = Router();

function generateCode(length = 8): string {
  return crypto.randomBytes(length).toString("base64url").slice(0, length).toLowerCase();
}

// Ensure table exists
async function ensureAffiliateLinksTable() {
  await db.execute(sql`
    DO $$
    BEGIN
      IF to_regclass('public.affiliate_links') IS NULL THEN
        CREATE TABLE affiliate_links (
          id SERIAL PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          destination_url TEXT NOT NULL,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          clicks INTEGER NOT NULL DEFAULT 0,
          last_used_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      END IF;
      ALTER TABLE affiliate_links ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP;
    END $$;
  `);
}

// GET /api/affiliate-links — List user's own links
router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureAffiliateLinksTable();
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const links = await db.select().from(affiliateLinksTable)
      .where(eq(affiliateLinksTable.userId, user.id))
      .orderBy(asc(affiliateLinksTable.id));
    return res.json({ ok: true, links });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to list links." });
  }
});

// POST /api/affiliate-links — Create
router.post("/", requireAuth, async (req, res) => {
  try {
    await ensureAffiliateLinksTable();
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const { name, destinationUrl, code: customCode } = req.body as { name?: string; destinationUrl?: string; code?: string };

    if (!name?.trim()) return res.status(400).json({ ok: false, error: "Name is required." });
    if (!destinationUrl?.trim()) return res.status(400).json({ ok: false, error: "Destination URL is required." });

    let code = customCode?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") || "";
    if (!code) {
      for (let i = 0; i < 10; i++) {
        code = generateCode(8);
        const existing = await db.select({ id: affiliateLinksTable.id }).from(affiliateLinksTable).where(eq(affiliateLinksTable.code, code));
        if (existing.length === 0) break;
      }
    } else {
      const existing = await db.select({ id: affiliateLinksTable.id }).from(affiliateLinksTable).where(eq(affiliateLinksTable.code, code));
      if (existing.length > 0) return res.status(400).json({ ok: false, error: "Code already exists." });
    }

    const [link] = await db.insert(affiliateLinksTable).values({
      code,
      name: name.trim(),
      destinationUrl: destinationUrl.trim(),
      userId: user.id,
      isActive: true,
    }).returning();

    return res.json({ ok: true, link });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to create link." });
  }
});

// PATCH /api/affiliate-links/:id — Update (only own links)
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    await ensureAffiliateLinksTable();
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const id = Number(req.params.id);
    const { name, destinationUrl, isActive } = req.body as { name?: string; destinationUrl?: string; isActive?: boolean };

    // Verify ownership
    const [existing] = await db.select().from(affiliateLinksTable).where(and(eq(affiliateLinksTable.id, id), eq(affiliateLinksTable.userId, user.id)));
    if (!existing) return res.status(404).json({ ok: false, error: "Link not found." });

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (destinationUrl !== undefined) updates.destinationUrl = destinationUrl.trim();
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db.update(affiliateLinksTable).set(updates).where(eq(affiliateLinksTable.id, id)).returning();
    return res.json({ ok: true, link: updated });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to update link." });
  }
});

// DELETE /api/affiliate-links/:id (only own links)
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await ensureAffiliateLinksTable();
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const id = Number(req.params.id);
    const [existing] = await db.select().from(affiliateLinksTable).where(and(eq(affiliateLinksTable.id, id), eq(affiliateLinksTable.userId, user.id)));
    if (!existing) return res.status(404).json({ ok: false, error: "Link not found." });

    await db.delete(affiliateLinksTable).where(eq(affiliateLinksTable.id, id));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to delete link." });
  }
});

// POST /api/affiliate-links/:id/reset-clicks (only own links)
router.post("/:id/reset-clicks", requireAuth, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const id = Number(req.params.id);
    const [existing] = await db.select().from(affiliateLinksTable).where(and(eq(affiliateLinksTable.id, id), eq(affiliateLinksTable.userId, user.id)));
    if (!existing) return res.status(404).json({ ok: false, error: "Link not found." });

    await db.update(affiliateLinksTable).set({ clicks: 0 }).where(eq(affiliateLinksTable.id, id));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to reset clicks." });
  }
});

export { ensureAffiliateLinksTable };
export default router;
