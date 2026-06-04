import { Router } from "express";
import { db } from "@workspace/db";
import { extractorProfilesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const profiles = await db
      .select()
      .from(extractorProfilesTable)
      .orderBy(desc(extractorProfilesTable.priority), desc(extractorProfilesTable.createdAt));
    res.json(profiles);
  } catch (err) {
    logger.error(err, "Failed to list extractor profiles");
    res.status(500).json({ error: "Gagal mengambil daftar profil" });
  }
});

router.post("/", async (req, res) => {
  const { name, domainPattern, urlPattern, method, config, customUa, priority, isActive, notes } = req.body;
  if (!name || !domainPattern || !method) {
    return res.status(400).json({ error: "name, domainPattern, method wajib diisi" });
  }
  try {
    const [profile] = await db
      .insert(extractorProfilesTable)
      .values({
        name,
        domainPattern: domainPattern.trim().toLowerCase(),
        urlPattern: urlPattern || null,
        method,
        config: typeof config === "object" ? JSON.stringify(config) : (config || "{}"),
        customUa: customUa || null,
        priority: priority ?? 0,
        isActive: isActive ?? true,
        notes: notes || null,
      })
      .returning();
    res.status(201).json(profile);
  } catch (err) {
    logger.error(err, "Failed to create extractor profile");
    res.status(500).json({ error: "Gagal membuat profil" });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });
  const { name, domainPattern, urlPattern, method, config, customUa, priority, isActive, notes } = req.body;
  try {
    const [profile] = await db
      .update(extractorProfilesTable)
      .set({
        name,
        domainPattern: domainPattern?.trim().toLowerCase(),
        urlPattern: urlPattern || null,
        method,
        config: typeof config === "object" ? JSON.stringify(config) : (config || "{}"),
        customUa: customUa || null,
        priority: priority ?? 0,
        isActive: isActive ?? true,
        notes: notes || null,
        updatedAt: new Date(),
      })
      .where(eq(extractorProfilesTable.id, id))
      .returning();
    if (!profile) return res.status(404).json({ error: "Profil tidak ditemukan" });
    res.json(profile);
  } catch (err) {
    logger.error(err, "Failed to update extractor profile");
    res.status(500).json({ error: "Gagal memperbarui profil" });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });
  try {
    await db.delete(extractorProfilesTable).where(eq(extractorProfilesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    logger.error(err, "Failed to delete extractor profile");
    res.status(500).json({ error: "Gagal menghapus profil" });
  }
});

router.post("/:id/record-result", async (req, res) => {
  const id = Number(req.params.id);
  const { success } = req.body;
  if (isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });
  try {
    if (success) {
      await db.update(extractorProfilesTable)
        .set({ successCount: sql`${extractorProfilesTable.successCount} + 1`, updatedAt: new Date() })
        .where(eq(extractorProfilesTable.id, id));
    } else {
      await db.update(extractorProfilesTable)
        .set({ failCount: sql`${extractorProfilesTable.failCount} + 1`, updatedAt: new Date() })
        .where(eq(extractorProfilesTable.id, id));
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(err, "Failed to record extractor result");
    res.status(500).json({ error: "Gagal mencatat hasil" });
  }
});

export default router;
