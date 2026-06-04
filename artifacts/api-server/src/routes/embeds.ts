import { Router } from "express";
import { db } from "@workspace/db";
import { embedsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateEmbedBody, UpdateEmbedBody, GetEmbedParams, UpdateEmbedParams, DeleteEmbedParams } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

function generateCode(length = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function toDoodEmbedUrl(url: string): string {
  if (!url) return url;
  const match = url.match(/dood\.[a-z]+\/(?:d|e|f|v|play)\/([a-zA-Z0-9]+)/);
  if (match) return `https://dood.stream/e/${match[1]}`;
  if (url.includes("dood.stream/e/")) return url;
  return url;
}

function buildEmbedUrl(req: { protocol: string; get: (h: string) => string | undefined }, code: string) {
  const host = req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  return `${proto}://${host}/v/${code}.mp4`;
}

function buildRedirectUrl(req: { protocol: string; get: (h: string) => string | undefined }, code: string) {
  const host = req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  return `${proto}://${host}/r/${code}.mp4`;
}

function toApiEmbed(embed: typeof embedsTable.$inferSelect, req: { protocol: string; get: (h: string) => string | undefined }) {
  return {
    ...embed,
    embedUrl: buildEmbedUrl(req, embed.code),
    redirectUrl: buildRedirectUrl(req, embed.code),
  };
}

router.get("/", async (req, res) => {
  const embeds = await db.select().from(embedsTable).orderBy(sql`${embedsTable.createdAt} desc`);
  res.json(embeds.map((e) => toApiEmbed(e, req)));
});

router.post("/", async (req, res) => {
  const body = CreateEmbedBody.parse(req.body);
  let code = generateCode(8);
  let attempts = 0;
  while (attempts < 5) {
    const existing = await db.select().from(embedsTable).where(eq(embedsTable.code, code));
    if (existing.length === 0) break;
    code = generateCode(8);
    attempts++;
  }
  const [embed] = await db.insert(embedsTable).values({
    code,
    title: body.title ?? null,
    doodUrl: body.doodUrl,
    customLink: body.customLink,
    popupDelay: body.popupDelay ?? 0,
    popupInterval: body.popupInterval ?? 180,
    popupOnClick: body.popupOnClick ?? 1,
    views: 0,
    clicks: 0,
  }).returning();
  res.status(201).json(toApiEmbed(embed, req));
});

router.get("/:id", async (req, res) => {
  const { id } = GetEmbedParams.parse({ id: Number(req.params.id) });
  const [embed] = await db.select().from(embedsTable).where(eq(embedsTable.id, id));
  if (!embed) return res.status(404).json({ error: "Not found" });
  res.json(toApiEmbed(embed, req));
});

router.put("/:id", async (req, res) => {
  const { id } = UpdateEmbedParams.parse({ id: Number(req.params.id) });
  const body = UpdateEmbedBody.parse(req.body);
  const [embed] = await db.update(embedsTable).set(body).where(eq(embedsTable.id, id)).returning();
  if (!embed) return res.status(404).json({ error: "Not found" });
  res.json(toApiEmbed(embed, req));
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteEmbedParams.parse({ id: Number(req.params.id) });
  await db.delete(embedsTable).where(eq(embedsTable.id, id));
  res.json({ ok: true });
});

export default router;
