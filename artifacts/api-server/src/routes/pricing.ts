import { Router } from "express";
import { db } from "@workspace/db";
import { pricingPlansTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "./auth";

const router = Router();

// GET /api/pricing - Public endpoint for landing page
router.get("/", async (req, res) => {
  try {
    const plans = await db
      .select()
      .from(pricingPlansTable)
      .where(eq(pricingPlansTable.isActive, true))
      .orderBy(asc(pricingPlansTable.sortOrder));

    const formatted = plans.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      period: p.period,
      description: p.description,
      features: p.features.split(/\\n|\n/).filter(Boolean),
      ctaText: p.ctaText,
      isPopular: p.isPopular,
    }));

    return res.json({ plans: formatted });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch plans" });
  }
});

// GET /api/pricing/admin - Admin: get all plans including inactive
router.get("/admin", requireAdmin, async (req, res) => {
  try {
    const plans = await db
      .select()
      .from(pricingPlansTable)
      .orderBy(asc(pricingPlansTable.sortOrder));

    return res.json({ plans });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch plans" });
  }
});

// POST /api/pricing/admin - Admin: create plan
router.post("/admin", requireAdmin, async (req, res) => {
  try {
    const { name, price, period, description, features, ctaText, isPopular, sortOrder } = req.body as {
      name?: string;
      price?: string;
      period?: string;
      description?: string;
      features?: string;
      ctaText?: string;
      isPopular?: boolean;
      sortOrder?: number;
    };

    if (!name?.trim() || !price?.trim()) {
      return res.status(400).json({ error: "Name and price are required" });
    }

    const [plan] = await db.insert(pricingPlansTable).values({
      name: name.trim(),
      price: price.trim(),
      period: period?.trim() || "/bulan",
      description: description?.trim() || null,
      features: features || "",
      ctaText: ctaText?.trim() || "Mulai Sekarang",
      isPopular: isPopular || false,
      sortOrder: sortOrder ?? 0,
      isActive: true,
    }).returning();

    return res.json({ ok: true, plan });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create plan" });
  }
});

// PATCH /api/pricing/admin/:id - Admin: update plan
router.patch("/admin/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, price, period, description, features, ctaText, isPopular, sortOrder, isActive } = req.body as {
      name?: string;
      price?: string;
      period?: string;
      description?: string;
      features?: string;
      ctaText?: string;
      isPopular?: boolean;
      sortOrder?: number;
      isActive?: boolean;
    };

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (price !== undefined) updates.price = price.trim();
    if (period !== undefined) updates.period = period.trim();
    if (description !== undefined) updates.description = description.trim();
    if (features !== undefined) updates.features = features;
    if (ctaText !== undefined) updates.ctaText = ctaText.trim();
    if (isPopular !== undefined) updates.isPopular = isPopular;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isActive !== undefined) updates.isActive = isActive;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    await db.update(pricingPlansTable).set(updates).where(eq(pricingPlansTable.id, id));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update plan" });
  }
});

// DELETE /api/pricing/admin/:id - Admin: delete plan
router.delete("/admin/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(pricingPlansTable).where(eq(pricingPlansTable.id, id));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete plan" });
  }
});

export default router;
