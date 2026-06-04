import { Router } from "express";
import { db } from "@workspace/db";
import { adsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

function parseDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((d) => typeof d === "string" && d.trim()).map((d) => d.trim());
  } catch {}
  return [];
}

function toApiAd(ad: typeof adsTable.$inferSelect) {
  return {
    ...ad,
    domains: parseDomains(ad.domains),
    isActive: ad.isActive === 1,
  };
}

router.get("/", async (_req, res) => {
  const ads = await db.select().from(adsTable).orderBy(sql`${adsTable.createdAt} desc`);
  res.json(ads.map(toApiAd));
});

router.post("/", async (req, res) => {
  const { name, type, targetUrl, imageUrl, buttonText, bgColor, textColor, domains, showDelaySec, closeDelaySec, isActive } = req.body;
  if (!name || !type || !targetUrl) {
    return res.status(400).json({ error: "name, type, and targetUrl are required" });
  }
  const [ad] = await db.insert(adsTable).values({
    name,
    type,
    targetUrl,
    imageUrl: imageUrl || null,
    buttonText: buttonText || "Visit Now",
    bgColor: bgColor || "#00e5ff",
    textColor: textColor || "#000000",
    domains: Array.isArray(domains) && domains.length > 0 ? JSON.stringify(domains) : null,
    showDelaySec: showDelaySec ?? 3,
    closeDelaySec: closeDelaySec ?? 0,
    isActive: isActive === false ? 0 : 1,
  }).returning();
  res.status(201).json(toApiAd(ad));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [ad] = await db.select().from(adsTable).where(eq(adsTable.id, id));
  if (!ad) return res.status(404).json({ error: "Not found" });
  res.json(toApiAd(ad));
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, type, targetUrl, imageUrl, buttonText, bgColor, textColor, domains, showDelaySec, closeDelaySec, isActive } = req.body;
  const updateData: Partial<typeof adsTable.$inferInsert> = {};
  if (name !== undefined) updateData.name = name;
  if (type !== undefined) updateData.type = type;
  if (targetUrl !== undefined) updateData.targetUrl = targetUrl;
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null;
  if (buttonText !== undefined) updateData.buttonText = buttonText;
  if (bgColor !== undefined) updateData.bgColor = bgColor;
  if (textColor !== undefined) updateData.textColor = textColor;
  if (domains !== undefined) updateData.domains = Array.isArray(domains) && domains.length > 0 ? JSON.stringify(domains) : null;
  if (showDelaySec !== undefined) updateData.showDelaySec = showDelaySec;
  if (closeDelaySec !== undefined) updateData.closeDelaySec = closeDelaySec;
  if (isActive !== undefined) updateData.isActive = isActive ? 1 : 0;

  const [ad] = await db.update(adsTable).set(updateData).where(eq(adsTable.id, id)).returning();
  if (!ad) return res.status(404).json({ error: "Not found" });
  res.json(toApiAd(ad));
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(adsTable).where(eq(adsTable.id, id));
  res.json({ ok: true });
});

router.post("/:id/toggle", async (req, res) => {
  const id = Number(req.params.id);
  const [ad] = await db.select().from(adsTable).where(eq(adsTable.id, id));
  if (!ad) return res.status(404).json({ error: "Not found" });
  const [updated] = await db.update(adsTable).set({ isActive: ad.isActive === 1 ? 0 : 1 }).where(eq(adsTable.id, id)).returning();
  res.json(toApiAd(updated));
});

export default router;
