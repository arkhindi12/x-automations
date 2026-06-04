import { Router } from "express";
import path from "path";
import os from "os";
import { randomBytes, createSign } from "crypto";
import { mkdir, readFile, unlink, readdir, stat } from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { execFile } from "child_process";
import { db } from "@workspace/db";
import { mediaTable, embedsTable, settingsTable, accountsTable, postsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { DeleteMediaParams } from "@workspace/api-zod";
import {
  smartExtractVideoUrl,
  isMarketplaceAdUrl,
  resolveJsRedirectChain,
  resolveYtdlpPath,
  tryYtdlp,
  tryHtmlFallback,
} from "../lib/smart-extractor";
import { fetchTweetMediaViaCookies, fetchUserIdByScreenName, fetchUserTweetsViaCookies, fetchTweetRepliesViaCookies, createTweetViaCookies, uploadMediaViaCookies } from "../lib/x-web-client";
import { enqueueJob } from "./background-jobs";


const router = Router();


async function mirrorImageToFreeimageHost(originalUrl: string): Promise<string | null> {
  const apiKey = process.env.FREEIMAGE_HOST_API_KEY?.trim();
  if (!apiKey) return null;

  const imageRes = await fetch(originalUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      Referer: "https://x.com/",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });

  if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`);
  const contentType = imageRes.headers.get("content-type") || "application/octet-stream";
  if (!contentType.startsWith("image/")) throw new Error(`Not an image response: ${contentType}`);

  const bytes = Buffer.from(await imageRes.arrayBuffer());
  const form = new FormData();
  form.append("key", apiKey);
  form.append("action", "upload");
  form.append("format", "json");
  form.append("source", bytes.toString("base64"));

  const uploadRes = await fetch("https://freeimage.host/api/1/upload", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  const payload = await uploadRes.json().catch(() => null) as {
    status_code?: number;
    success?: { message?: string; code?: number };
    image?: { url?: string; display_url?: string; thumb?: { url?: string } };
    error?: { message?: string; code?: number };
    status_txt?: string;
  } | null;

  const link = payload?.image?.url?.trim() || payload?.image?.display_url?.trim() || payload?.image?.thumb?.url?.trim();
  if (!uploadRes.ok || payload?.status_code !== 200 || !link) {
    throw new Error(payload?.error?.message || payload?.status_txt || `freeimage.host upload failed: ${uploadRes.status}`);
  }
  return link.replace(/\\/g, "").replace(/^http:\/\//i, "https://");
}

async function extractTextFromImage(imageUrl: string): Promise<string | null> {
  try {
    // Use OCR.space free API
    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        apikey: 'helloworld', // Free API key
        url: imageUrl,
        language: 'eng',
        isOverlayRequired: 'false',
        detectOrientation: 'false',
        scale: 'true',
        OCREngine: '2'
      })
    });

    if (!response.ok) {
      throw new Error(`OCR API failed: ${response.status}`);
    }

    const data = await response.json() as {
      ParsedResults?: Array<{ ParsedText?: string }>;
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string[];
    };

    if (data.IsErroredOnProcessing || !data.ParsedResults?.[0]?.ParsedText) {
      throw new Error(data.ErrorMessage?.join(', ') || 'OCR processing failed');
    }

    const text = data.ParsedResults[0].ParsedText.trim().replace(/\r\n/g, ' ').replace(/\s+/g, ' ');
    return text.length > 3 ? text : null;
  } catch (error) {
    console.warn(`[OCR] Failed to extract text from ${imageUrl}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const massGrabProgressClients = new Map<string, Set<any>>();
const massGrabProgressBuffer = new Map<string, string[]>();

function pushMassGrabProgress(progressId: string | null | undefined, message: string) {
  if (!progressId) return;
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  const buffer = massGrabProgressBuffer.get(progressId) ?? [];
  buffer.push(line);
  massGrabProgressBuffer.set(progressId, buffer.slice(-300));
  const clients = massGrabProgressClients.get(progressId);
  if (!clients) return;
  for (const client of clients) {
    try { client.write(`data: ${JSON.stringify({ message: line })}\n\n`); } catch {}
  }
}

router.get("/mass-grab-progress/:progressId", (req, res) => {
  const progressId = String(req.params.progressId || "");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const clients = massGrabProgressClients.get(progressId) ?? new Set<any>();
  clients.add(res);
  massGrabProgressClients.set(progressId, clients);

  for (const line of massGrabProgressBuffer.get(progressId) ?? []) {
    res.write(`data: ${JSON.stringify({ message: line })}\n\n`);
  }

  req.on("close", () => {
    clients.delete(res);
    if (clients.size === 0) massGrabProgressClients.delete(progressId);
  });
});

router.get("/", async (req, res) => {
  const type = req.query.type as string | undefined;
  const jobIdStr = req.query.jobId as string | undefined;

  let query = db.select().from(mediaTable).$dynamic();

  const conditions = [];
  if (type && type !== "all") {
    conditions.push(eq(mediaTable.type, type));
  }
  if (jobIdStr) {
    conditions.push(eq(mediaTable.jobId, parseInt(jobIdStr)));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const items = await query.orderBy(mediaTable.createdAt);
  res.json(items);
});

router.delete("/", async (req, res) => {
  const type = req.query.type as string | undefined;
  const deleteQuery = db.delete(mediaTable).$dynamic();
  const deleted = type && type !== "all"
    ? await deleteQuery.where(eq(mediaTable.type, type)).returning({ id: mediaTable.id })
    : await deleteQuery.returning({ id: mediaTable.id });
  res.json({ ok: true, deleted: deleted.length });
});

// DELETE /api/media/cleanup-no-video — Remove media without usable video URL
router.delete("/cleanup-no-video", async (_req, res) => {
  try {
    const deleted = await db.delete(mediaTable).where(
      and(
        eq(mediaTable.type, "video"),
        sql`${mediaTable.streamtapeUrl} IS NULL`,
        sql`${mediaTable.doodUrl} IS NULL`,
        sql`${mediaTable.originalUrl} NOT LIKE '%streamtape%'`,
        sql`${mediaTable.originalUrl} NOT LIKE '%dood%'`,
        sql`${mediaTable.originalUrl} NOT LIKE '%videy.co%'`,
      )
    ).returning({ id: mediaTable.id });
    res.json({ ok: true, deleted: deleted.length });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to cleanup." });
  }
});

router.post("/clean-duplicates", async (req, res) => {
  const type = (req.body?.type || req.query.type || "all") as string;
  const by = String(req.body?.by || req.query.by || "url");
  const items = await db.select().from(mediaTable).orderBy(mediaTable.id);
  const seen = new Map<string, number>();
  const duplicateIds: number[] = [];

  for (const item of items) {
    if (type !== "all" && item.type !== type) continue;
    const key = by === "source-tweet"
      ? (item.sourceTweetId ? `${item.type}|${item.sourceTweetId}` : "")
      : normalizeMediaUrlForDedupe(item.originalUrl);
    if (!key) continue;
    if (seen.has(key)) {
      duplicateIds.push(item.id);
    } else {
      seen.set(key, item.id);
    }
  }

  let deleted: Array<{ id: number }> = [];
  if (duplicateIds.length > 0) {
    for (const id of duplicateIds) {
      const rows = await db.delete(mediaTable).where(eq(mediaTable.id, id)).returning({ id: mediaTable.id });
      deleted = deleted.concat(rows);
    }
  }

  res.json({ ok: true, by, scanned: items.length, duplicates: duplicateIds.length, deleted: deleted.length, kept: seen.size, deletedIds: duplicateIds });
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteMediaParams.parse({ id: Number(req.params.id) });
  await db.delete(mediaTable).where(eq(mediaTable.id, id));
  res.json({ ok: true });
});

router.patch("/:id", async (req, res) => {
  const { id } = DeleteMediaParams.parse({ id: Number(req.params.id) });
  const {
    targetUsername,
    originalUrl,
    statusUrl,
    doodUrl,
  } = req.body as {
    targetUsername?: string;
    originalUrl?: string;
    statusUrl?: string;
    doodUrl?: string | null;
  };

  const parsedStatus = parseXStatusUrl(statusUrl);
  const updateValues: Partial<typeof mediaTable.$inferInsert> = {};

  if (targetUsername !== undefined) updateValues.targetUsername = parsedStatus.username ?? (targetUsername.trim() || "manual");
  if (originalUrl !== undefined && originalUrl.trim()) updateValues.originalUrl = originalUrl.trim();
  if (statusUrl !== undefined) {
    updateValues.sourceTweetId = parsedStatus.tweetId;
    updateValues.sourceText = parsedStatus.normalizedUrl ? `Manual source status: ${parsedStatus.normalizedUrl}` : null;
    if (parsedStatus.username) updateValues.targetUsername = parsedStatus.username;
  }
  if (doodUrl !== undefined) {
    const cleanDoodUrl = doodUrl?.trim() || null;
    updateValues.doodUrl = cleanDoodUrl;
    updateValues.doodStatus = cleanDoodUrl ? "done" : null;
  }

  const [updated] = await db.update(mediaTable).set(updateValues).where(eq(mediaTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Media not found." });
  res.json(updated);
});

async function rescrapeVideoStreamtape(id: number, accountId: number | null) {
  const [item] = await db.select().from(mediaTable).where(eq(mediaTable.id, id));
  if (!item) throw new Error("Media not found.");

  let directVideoUrl = item.type === "video" ? item.originalUrl : null;
  let sourceText = item.sourceText ?? null;
  let thumbnailUrl = item.thumbnailUrl ?? null;
  let targetUsername = item.targetUsername ?? "manual";

  if (!directVideoUrl && item.sourceTweetId) {
    const accountRows = accountId
      ? await db.select().from(accountsTable).where(eq(accountsTable.id, accountId))
      : await db.select().from(accountsTable).where(eq(accountsTable.authMode, "cookies"));
    const account = accountRows[0];
    if (!account) throw new Error("Cookie account required to re-scrape source tweet.");
    if (account.authMode !== "cookies") throw new Error("Selected account must use cookie auth.");

    const found = await fetchTweetMediaViaCookies(account, item.sourceTweetId);
    const baseItems = found.items.map((mediaItem) => ({
      ...mediaItem,
      targetUsername: mediaItem.targetUsername || item.targetUsername || found.tweet?.username || "manual",
      extraVideoUrls: [],
    }));
    let enriched = await appendExternalVideoItemsFromTweetUrls(
      baseItems,
      found.tweet ? [{ ...found.tweet, username: found.tweet.username || item.targetUsername || "" }] : [],
      item.targetUsername || found.tweet?.username || "manual",
      10,
    );

    try {
      const repliesData = await fetchTweetRepliesViaCookies(account, item.sourceTweetId);
      if (repliesData.replies.length > 0) {
        const replyItems = await appendExternalVideoItemsFromTweetUrls(
          baseItems,
          repliesData.replies.map((reply) => ({ ...reply, username: reply.username || "reply" })),
          item.targetUsername || found.tweet?.username || "manual",
          20,
        );
        enriched = enriched.concat(replyItems.filter((replyItem) => replyItem.type === "video"));
      }
    } catch (replyError) {
      console.warn(`[RESCRAPE] Reply scan failed for media ${id}: ${replyError instanceof Error ? replyError.message : String(replyError)}`);
    }

    const videoItem = enriched.find((mediaItem) => mediaItem.type === "video");
    if (!videoItem) throw new Error("No video found when re-scraping source tweet.");

    directVideoUrl = videoItem.originalUrl;
    sourceText = videoItem.sourceText ?? sourceText;
    thumbnailUrl = (videoItem as any).thumbnailUrl ?? thumbnailUrl ?? (item.type === "image" ? item.originalUrl : null);
    targetUsername = videoItem.targetUsername || targetUsername;
  }

  if (!directVideoUrl) throw new Error("This media has no video URL or source tweet to re-scrape.");

  const streamtapeUrl = await uploadVideoToStreamtape(directVideoUrl);
  const [updated] = await db.update(mediaTable).set({
    type: "video",
    originalUrl: directVideoUrl,
    targetUsername,
    sourceText: sourceText ? sourceText.replace(/\n*\[streamtape-error\][^\n]*/g, "").trim() : sourceText,
    thumbnailUrl,
    streamtapeUrl,
  }).where(eq(mediaTable.id, id)).returning();

  return { ok: true, media: updated, streamtapeUrl, originalUrl: directVideoUrl };
}

const rescrapeBg = new Map<number, { running: boolean; status: string; error?: string; result?: unknown; startedAt?: string; finishedAt?: string }>();

router.get("/:id/rescrape-video-streamtape-background/status", (req, res) => {
  const id = Number(req.params.id);
  return res.json({ ok: true, id, ...(rescrapeBg.get(id) || { running: false, status: "idle" }) });
});

router.post("/:id/rescrape-video-streamtape-background", async (req, res) => {
  const { id } = DeleteMediaParams.parse({ id: Number(req.params.id) });
  const accountId = req.body?.accountId ? Number(req.body.accountId) : null;
  const current = rescrapeBg.get(id);
  if (current?.running) return res.json({ ok: true, id, ...current });

  const state = { running: true, status: "running", startedAt: new Date().toISOString() };
  rescrapeBg.set(id, state);
  void rescrapeVideoStreamtape(id, accountId)
    .then((result) => rescrapeBg.set(id, { running: false, status: "completed", result, startedAt: state.startedAt, finishedAt: new Date().toISOString() }))
    .catch((error) => rescrapeBg.set(id, { running: false, status: "failed", error: error instanceof Error ? error.message : String(error), startedAt: state.startedAt, finishedAt: new Date().toISOString() }));

  return res.json({ ok: true, id, ...state });
});

router.post("/:id/rescrape-video-streamtape", async (req, res) => {
  try {
    const { id } = DeleteMediaParams.parse({ id: Number(req.params.id) });
    const accountId = req.body?.accountId ? Number(req.body.accountId) : null;
    return res.json(await rescrapeVideoStreamtape(id, accountId));
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to re-scrape video." });
  }
});

async function extractVideoInfo(normalizedUrl: string) {
  const ytdlpPath = await resolveYtdlpPath();
  const chain = await resolveJsRedirectChain(normalizedUrl).catch(() => [normalizedUrl]);

  let title: string | null = null;
  let thumbnail: string | null = null;
  let directUrl: string | null = null;
  let method: "ytdlp" | "html" | "original" = "original";

  if (ytdlpPath) {
    let info: Record<string, unknown> | null = null;
    for (const candidate of chain) {
      info = await tryYtdlp(ytdlpPath, candidate).catch(() => null);
      if (info) break;
    }

    if (info) {
      title = (info.title as string) || null;
      thumbnail = (info.thumbnail as string) || null;

      const formats = (info.formats as Array<Record<string, unknown>>) || [];
      const videoFormats = formats
        .filter((f) => {
          const vcodec = f.vcodec as string;
          return vcodec && vcodec !== "none" && f.url;
        })
        .sort((a, b) => ((b.height as number) || 0) - ((a.height as number) || 0));

      if (videoFormats.length > 0 && videoFormats[0].url) {
        directUrl = videoFormats[0].url as string;
        method = "ytdlp";
      } else if (info.url) {
        directUrl = info.url as string;
        method = "ytdlp";
      }
    }
  }

  if (!directUrl) {
    const fallback = await tryHtmlFallback(normalizedUrl, chain).catch(() => null);
    if (fallback && fallback.urls.length > 0) {
      directUrl = fallback.urls[0].url;
      title = fallback.title;
      thumbnail = fallback.thumbnail;
      method = "html";
    }
  }

  if (!directUrl) {
    directUrl = normalizedUrl;
    method = "original";
  }

  return { success: true, directUrl, method, chain, title, thumbnail };
}

router.post("/extract-batch", async (req, res) => {
  const rawUrls = String(req.body?.urls ?? "")
    .split(/[\n,]+/g)
    .map((url) => url.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (rawUrls.length === 0) return res.status(400).json({ ok: false, error: "Paste at least one URL." });

  const results = [];
  for (const rawUrl of rawUrls) {
    let normalizedUrl = rawUrl;
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
    try {
      new URL(normalizedUrl);
      const data = await extractVideoInfo(normalizedUrl);
      let isValidVideo = false;
      let validationError: string | null = null;
      try {
        await assertRealVideoUrl(data.directUrl);
        isValidVideo = true;
      } catch (error) {
        validationError = error instanceof Error ? error.message : String(error);
      }
      results.push({ url: rawUrl, normalizedUrl, ok: true, ...data, isValidVideo, validationError });
    } catch (error) {
      results.push({ url: rawUrl, normalizedUrl, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return res.json({ ok: true, results });
});

router.post("/extract", async (req, res) => {
  const { url } = req.body as { url?: string };

  console.log(`[EXTRACT] Received URL: "${url}"`);

  if (!url?.trim()) {
    console.log(`[EXTRACT] Error: URL empty`);
    return res.status(400).json({ error: "URL diperlukan." });
  }

  let normalizedUrl = url.trim();
  console.log(`[EXTRACT] Trimmed URL: "${normalizedUrl}"`);
  
  // Auto-add https:// if no protocol
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
    console.log(`[EXTRACT] Added https:// -> "${normalizedUrl}"`);
  }

  try {
    new URL(normalizedUrl);
    console.log(`[EXTRACT] URL validation passed`);
  } catch (err) {
    console.error(`[EXTRACT] Invalid URL: "${url}" -> "${normalizedUrl}"`, err);
    return res.status(400).json({ error: "URL tidak valid." });
  }

  try {
    const data = await extractVideoInfo(normalizedUrl);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Gagal mengekstrak URL video.",
    });
  }
});

function generateEmbedCode(length = 10): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function parseEmbedDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((d) => typeof d === "string" && d.trim()).map((d) => d.trim());
  } catch {}
  return [];
}

async function getEmbedDomain(): Promise<string | null> {
  try {
    const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    const domains = parseEmbedDomains(settings?.embedDomains);
    if (domains.length === 0 && settings?.embedDomain?.trim()) {
      domains.push(settings.embedDomain.trim());
    }
    if (domains.length === 0) return null;
    return domains[Math.floor(Math.random() * domains.length)];
  } catch {
    return null;
  }
}

async function buildEmbedForDood(doodUrl: string, title: string): Promise<string | null> {
  const domain = await getEmbedDomain();
  if (!domain) return null;

  let code = generateEmbedCode(10);
  let attempts = 0;
  while (attempts < 5) {
    const existing = await db.select().from(embedsTable).where(eq(embedsTable.code, code));
    if (existing.length === 0) break;
    code = generateEmbedCode(10);
    attempts++;
  }

  await db.insert(embedsTable).values({
    code,
    title,
    doodUrl,
    customLink: doodUrl,
    popupDelay: 0,
    popupInterval: 180,
    popupOnClick: 1,
    views: 0,
    clicks: 0,
  });

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${cleanDomain}/v/${code}.mp4`;
}

function toDoodUrl(payload: { msg?: string; result?: string | { download_url?: string; embed_url?: string; protected_embed?: string; filecode?: string; file_code?: string; upload_url?: string; url?: string } }): string | null {
  const result = payload.result;
  if (typeof result === "string") return result.startsWith("http") ? result : null;
  if (!result) return null;
  const directUrl = result.download_url ?? result.embed_url ?? result.protected_embed;
  if (directUrl) return directUrl;
  const fileCode = result.filecode ?? result.file_code;
  return fileCode ? `https://dood.stream/d/${fileCode}` : null;
}

async function getDoodApiKey(explicitKey?: string | null) {
  if (explicitKey?.trim()) return explicitKey.trim();
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
  return settings?.doodstreamApiKey?.trim() || null;
}

async function uploadUrlToDood(apiKey: string | null | undefined, originalUrl: string): Promise<string> {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey) throw new Error("DoodStream API key is missing.");

  const endpoint = new URL("https://doodapi.com/api/upload/url");
  endpoint.searchParams.set("key", trimmedKey);
  endpoint.searchParams.set("url", originalUrl);

  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });

  const payload = await response.json().catch(() => null) as {
    status?: number;
    msg?: string;
    result?: string | { download_url?: string; embed_url?: string; protected_embed?: string; filecode?: string; file_code?: string };
  } | null;

  if (!response.ok || !payload) throw new Error(`DoodStream upload failed with HTTP ${response.status}.`);
  if (payload.status && payload.status >= 400) throw new Error(payload.msg ?? "DoodStream upload failed.");

  const doodUrl = toDoodUrl(payload);

  if (!doodUrl) throw new Error(payload?.msg ?? "DoodStream did not return a usable video URL.");
  return doodUrl;
}

async function getDoodUploadServerUrl(apiKey: string): Promise<string> {
  const endpoint = new URL("https://doodapi.com/api/upload/server");
  endpoint.searchParams.set("key", apiKey);
  const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload) throw new Error(`DoodStream upload server lookup failed with HTTP ${response.status}.`);
  if (payload.status && payload.status >= 400) throw new Error(payload.msg ?? "DoodStream upload server lookup failed.");
  const result = payload.result;
  const uploadUrl = typeof result === "string" ? result : (result?.upload_url ?? result?.url);
  if (!uploadUrl) throw new Error(payload.msg ?? "DoodStream did not return an upload server URL.");
  return uploadUrl;
}

async function assertRealVideoUrl(videoUrl: string): Promise<void> {
  const response = await fetch(videoUrl, {
    headers: {
      Accept: "video/mp4,video/*,*/*",
      "Accept-Encoding": "identity",
      Range: "bytes=0-4095",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Video validation failed with HTTP ${response.status}.`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const contentLength = Number(response.headers.get("content-length") || 0);
  const arrayBuffer = await response.arrayBuffer();
  const sample = Buffer.from(arrayBuffer);
  const ascii = sample.toString("latin1");
  const textSample = sample.toString("utf8").slice(0, 2048).toLowerCase();

  const hasMp4Signature = ascii.includes("ftyp") || ascii.includes("moov") || ascii.includes("mdat");
  const hasVideoContentType = contentType.startsWith("video/") || contentType.includes("octet-stream");
  const looksLikeHtml = !hasVideoContentType && !hasMp4Signature && (textSample.includes("<!doctype") || textSample.includes("<html") || textSample.includes("<script"));

  // If HTML page contains a <video> or <source> tag with .mp4, it's a video wrapper page — accept it
  if (looksLikeHtml) {
    const sourceMatch = textSample.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)/);
    const videoSrcMatch = textSample.match(/<video[^>]+src=["']([^"']+\.mp4[^"']*)/);
    if (sourceMatch || videoSrcMatch) {
      return; // Valid — it's a wrapper page with embedded video
    }
    throw new Error("URL returned HTML page, not a video file.");
  }
  if (!hasVideoContentType && !hasMp4Signature) throw new Error(`URL is not a real video file (content-type: ${contentType || "unknown"}).`);
  if (contentLength > 0 && contentLength < 50_000 && !hasMp4Signature) throw new Error("Video file is too small or invalid.");
}

async function downloadVideoToTempFile(videoUrl: string): Promise<string> {
  await assertRealVideoUrl(videoUrl);
  const downloadDir = path.join(os.tmpdir(), "x-automation-manual-downloads");
  await mkdir(downloadDir, { recursive: true });
  const filePath = path.join(downloadDir, `${Date.now()}-${randomBytes(8).toString("hex")}.mp4`);
  const response = await fetch(videoUrl, {
    headers: { Accept: "video/mp4,video/*,*/*", "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    redirect: "follow",
    signal: AbortSignal.timeout(600000), // 10 minutes for large videos
  });
  if (!response.ok || !response.body) throw new Error(`Video download failed with HTTP ${response.status}.`);
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(filePath));
  return filePath;
}

/**
 * Periodic cleanup for stale temp video files.
 * Removes files older than 15 minutes to handle cases where:
 * - Server crashed mid-download
 * - Process was killed before finally{} could run
 * - OOM or timeout left orphaned files
 */
const TEMP_CLEANUP_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const TEMP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

async function cleanupStaleTempDownloads() {
  const downloadDir = path.join(os.tmpdir(), "x-automation-manual-downloads");
  try {
    const files = await readdir(downloadDir);
    let removed = 0;
    const now = Date.now();
    for (const file of files) {
      try {
        const filePath = path.join(downloadDir, file);
        const fileStat = await stat(filePath);
        if (now - fileStat.mtimeMs > TEMP_CLEANUP_MAX_AGE_MS) {
          await unlink(filePath).catch(() => undefined);
          removed++;
        }
      } catch {
        // skip individual file errors
      }
    }
    if (removed > 0) {
      console.log(`[TEMP-CLEANUP] Removed ${removed} stale file(s) from ${downloadDir}`);
    }
  } catch {
    // directory doesn't exist or not readable — nothing to clean
  }
}

// Start cleanup interval (unref so it doesn't prevent process exit)
setInterval(cleanupStaleTempDownloads, TEMP_CLEANUP_INTERVAL_MS).unref();
// Run once on startup after a short delay
setTimeout(cleanupStaleTempDownloads, 10_000).unref();

async function uploadFileToDood(apiKey: string, filePath: string): Promise<string> {
  const uploadUrl = await getDoodUploadServerUrl(apiKey);
  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "video/mp4" }), path.basename(filePath));
  const response = await fetch(uploadUrl, { method: "POST", headers: { Accept: "application/json" }, body: form, signal: AbortSignal.timeout(300000) });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload) throw new Error(`DoodStream file upload failed with HTTP ${response.status}.`);
  if (payload.status && payload.status >= 400) throw new Error(payload.msg ?? "DoodStream file upload failed.");
  const doodUrl = toDoodUrl(payload);
  if (!doodUrl) throw new Error(payload.msg ?? "DoodStream did not return a usable video URL after file upload.");
  return doodUrl;
}

async function verifyDoodFile(apiKey: string, doodUrl: string): Promise<boolean> {
  try {
    const fileCode = doodUrl.match(/\/[de]\/([a-z0-9]+)/i)?.[1];
    if (!fileCode) return true; // can't verify, assume ok
    const endpoint = new URL("https://doodapi.com/api/file/info");
    endpoint.searchParams.set("key", apiKey);
    endpoint.searchParams.set("file_code", fileCode);
    const res = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    const payload = await res.json().catch(() => null) as any;
    const file = Array.isArray(payload?.result) ? payload.result[0] : payload?.result;
    if (!file) return false;
    const size = Number(file.length ?? file.size ?? 0);
    return size > 1000;
  } catch {
    return true; // network error, assume ok
  }
}

async function uploadVideoToDoodRobust(apiKey: string, originalUrl: string): Promise<string> {
  // Use remote URL upload (file upload blocked on this API key).
  // After upload, verify file exists and has content with retries.
  const directUrl = await smartExtractVideoUrl(originalUrl);
  const doodUrl = await uploadUrlToDood(apiKey, directUrl);

  // Dood remote upload is async — file processing takes time on their server.
  // Retry verification with increasing delays.
  const delays = [10000, 20000, 30000, 60000]; // 10s, 20s, 30s, 60s
  for (let i = 0; i < delays.length; i++) {
    await new Promise((r) => setTimeout(r, delays[i]));
    const valid = await verifyDoodFile(apiKey, doodUrl);
    if (valid) return doodUrl;
    console.log(`[DOOD] Verification attempt ${i + 1}/${delays.length} failed for ${doodUrl}, retrying...`);
  }

  // Final check failed — mark as pending instead of failed, file might still be processing
  console.warn(`[DOOD] File still not ready after all retries: ${doodUrl}`);
  return doodUrl; // Return URL anyway — Dood may finish processing later
}

// ─── Streamtape helpers ────────────────────────────────────────────────
const STREAMTAPE_REAL_IPS = ["104.21.96.46", "172.67.173.3"]; // bypass ISP DNS block
import * as https from "https";

function streamtapeApiCallOnce(path: string, ip: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: ip,
      port: 443,
      path,
      method: "GET",
      headers: { Host: "api.streamtape.com", Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      servername: "api.streamtape.com",
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c: Buffer) => (data += c.toString()));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error(`Streamtape JSON parse failed: ${data.slice(0, 200)}`)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Streamtape API timeout")); });
    req.end();
  });
}

async function streamtapeApiCall(path: string): Promise<any> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const ip of STREAMTAPE_REAL_IPS) {
      try {
        return await streamtapeApiCallOnce(path, ip);
      } catch (error) {
        lastError = error;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function getStreamtapeCredentials(): Promise<{ login: string; key: string } | null> {
  // Settings Admin wins; .env is fallback only.
  try {
    const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    const l = settings?.streamtapeLogin?.trim();
    const k = settings?.streamtapeKey?.trim();
    if (l && k) return { login: l, key: k };
  } catch {}

  const login = process.env.STREAMTAPE_LOGIN?.trim();
  const key = process.env.STREAMTAPE_KEY?.trim();
  if (login && key) return { login, key };
  return null;
}

function uploadFileToStreamtapeWithCurl(uploadUrl: string, localPath: string, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("curl", [
      "-sS",
      "--fail-with-body",
      "--max-time", "900",
      "--connect-timeout", "30",
      "--retry", "2",
      "--retry-delay", "5",
      "-H", "Accept: application/json",
      "-F", `file1=@${localPath};type=video/mp4;filename=${filename}`,
      uploadUrl,
    ], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`curl upload failed: ${error.message}${stderr ? ` — ${stderr.slice(0, 500)}` : ""}${stdout ? ` — ${stdout.slice(0, 500)}` : ""}`));
        return;
      }
      resolve(stdout);
    });
    child.on("error", reject);
  });
}

async function uploadVideoToStreamtape(originalUrl: string): Promise<string> {
  const creds = await getStreamtapeCredentials();
  if (!creds) throw new Error("Streamtape credentials not configured.");

  const directUrl = await smartExtractVideoUrl(originalUrl);
  const localPath = await downloadVideoToTempFile(directUrl);

  try {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Get a fresh upload URL for each attempt.
        const ulInfo = await streamtapeApiCall(`/file/ul?login=${creds.login}&key=${creds.key}`);
        if (ulInfo.status !== 200 || !ulInfo.result?.url) {
          throw new Error(`Streamtape upload server failed: ${ulInfo.msg || JSON.stringify(ulInfo)}`);
        }
        const uploadUrl: string = ulInfo.result.url;

        const uploadText = await uploadFileToStreamtapeWithCurl(uploadUrl, localPath, `${Date.now()}-${attempt}.mp4`);
        let uploadData: any;
        try {
          uploadData = JSON.parse(uploadText);
        } catch {
          throw new Error(`Streamtape upload response not JSON: ${uploadText.slice(0, 200)}`);
        }

        if (uploadData.status !== 200 || !uploadData.result?.url) {
          throw new Error(`Streamtape upload failed: ${uploadData.msg || uploadText.slice(0, 200)}`);
        }

        console.log(`[STREAMTAPE] Upload OK (attempt ${attempt}): ${uploadData.result.url}`);
        return uploadData.result.url;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[STREAMTAPE] Upload attempt ${attempt}/3 failed for ${originalUrl}: ${lastError.message}`);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 5000));
        }
      }
    }

    throw lastError ?? new Error("Streamtape upload failed after 3 attempts.");
  } finally {
    await unlink(localPath).catch(() => undefined);
  }
}

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let cachedGoogleServiceAccount: GoogleServiceAccount | null | undefined;
let cachedGoogleAccessToken: { token: string; expiresAt: number } | null = null;

function getGoogleDriveConfig() {
  const serviceAccountPath = process.env.GDRIVE_SERVICE_ACCOUNT_JSON_PATH?.trim();
  const folderId = process.env.GDRIVE_FOLDER_ID?.trim();
  if (!serviceAccountPath || !folderId) return null;
  return { serviceAccountPath, folderId };
}

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getGoogleServiceAccount(): Promise<GoogleServiceAccount> {
  if (cachedGoogleServiceAccount !== undefined && cachedGoogleServiceAccount !== null) return cachedGoogleServiceAccount;
  const cfg = getGoogleDriveConfig();
  if (!cfg) throw new Error("Google Drive config missing. Set GDRIVE_SERVICE_ACCOUNT_JSON_PATH and GDRIVE_FOLDER_ID.");
  const text = await (await import("fs/promises")).readFile(cfg.serviceAccountPath, "utf8");
  const parsed = JSON.parse(text) as GoogleServiceAccount;
  if (!parsed.client_email || !parsed.private_key) throw new Error("Invalid Google service account JSON.");
  cachedGoogleServiceAccount = parsed;
  return parsed;
}

async function getGoogleAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleAccessToken && cachedGoogleAccessToken.expiresAt - 60 > now) return cachedGoogleAccessToken.token;

  const sa = await getGoogleServiceAccount();
  const iat = now;
  const exp = now + 3600;
  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = toBase64Url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat,
    exp,
  }));
  const unsignedJwt = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(sa.private_key, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const jwt = `${unsignedJwt}.${signature}`;

  const tokenResponse = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const tokenPayload = await tokenResponse.json().catch(() => null) as { access_token?: string; expires_in?: number; error_description?: string } | null;
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error(tokenPayload?.error_description || `Google OAuth token request failed with HTTP ${tokenResponse.status}.`);
  }

  cachedGoogleAccessToken = {
    token: tokenPayload.access_token,
    expiresAt: now + Number(tokenPayload.expires_in || 3600),
  };
  return cachedGoogleAccessToken.token;
}

async function uploadFileToGoogleDrive(localPath: string, fileName: string): Promise<{ fileId: string; webViewLink: string; directDownloadUrl: string }> {
  const cfg = getGoogleDriveConfig();
  if (!cfg) throw new Error("Google Drive config missing.");
  const token = await getGoogleAccessToken();

  const metadata = {
    name: fileName,
    parents: [cfg.folderId],
  };

  const initRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,webContentLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(metadata),
    signal: AbortSignal.timeout(30000),
  });

  const uploadUrl = initRes.headers.get("location");
  if (!initRes.ok || !uploadUrl) {
    const text = await initRes.text().catch(() => "");
    throw new Error(`Google Drive resumable init failed: HTTP ${initRes.status} ${text}`);
  }

  const fileBuffer = await readFile(localPath);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Length": String(fileBuffer.length),
      "Content-Type": "video/mp4",
    },
    body: fileBuffer,
    signal: AbortSignal.timeout(600000),
  });

  const uploadText = await uploadRes.text().catch(() => "");
  let uploaded: { id?: string; webViewLink?: string; webContentLink?: string } | null = null;
  try {
    uploaded = uploadText ? (JSON.parse(uploadText) as { id?: string; webViewLink?: string; webContentLink?: string }) : null;
  } catch {
    uploaded = null;
  }
  if (!uploadRes.ok || !uploaded?.id) {
    throw new Error(`Google Drive upload failed: HTTP ${uploadRes.status} ${uploadText}`);
  }

  await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
    signal: AbortSignal.timeout(30000),
  });

  const directDownloadUrl = `https://drive.google.com/uc?export=download&id=${uploaded.id}`;
  return {
    fileId: uploaded.id,
    webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
    directDownloadUrl,
  };
}

async function uploadVideoToDoodViaGoogleDrive(apiKey: string, originalUrl: string, sourceTweetId?: string | null): Promise<{ doodUrl: string; gdriveWebViewLink: string; gdriveDirectDownloadUrl: string }> {
  const directVideoUrl = await smartExtractVideoUrl(originalUrl);
  const localPath = await downloadVideoToTempFile(directVideoUrl);
  try {
    const suffix = sourceTweetId ? `status-${sourceTweetId}` : `video-${Date.now()}`;
    const gdrive = await uploadFileToGoogleDrive(localPath, `${suffix}.mp4`);

    try {
      const doodUrl = await uploadUrlToDood(apiKey, gdrive.directDownloadUrl);
      return { doodUrl, gdriveWebViewLink: gdrive.webViewLink, gdriveDirectDownloadUrl: gdrive.directDownloadUrl };
    } catch (remoteError) {
      console.warn(`[MEDIA] Dood remote upload from Google Drive failed, fallback to file upload: ${remoteError instanceof Error ? remoteError.message : String(remoteError)}`);
      const doodUrl = await uploadFileToDood(apiKey, localPath);
      return { doodUrl, gdriveWebViewLink: gdrive.webViewLink, gdriveDirectDownloadUrl: gdrive.directDownloadUrl };
    }
  } finally {
    await unlink(localPath).catch(() => undefined);
  }
}

async function appendExternalVideoItemsFromTweetUrls(
  baseItems: Array<{ type: "image" | "video"; originalUrl: string; sourceTweetId: string; sourceText: string | null; targetUsername: string; extraVideoUrls: string[]; thumbnailUrl?: string | null }>,
  tweets: Array<{ id: string; text: string | null; urls: string[]; username?: string | null }>,
  fallbackUsername: string,
  maxExtractAttempts = 10,
) {
  const merged = [...baseItems];
  const tweetImages = new Map<string, string>(); // tweetId -> first image URL
  for (const item of baseItems) {
    if (item.type === "image" && item.sourceTweetId && !tweetImages.has(String(item.sourceTweetId))) {
      tweetImages.set(String(item.sourceTweetId), item.originalUrl);
    }
  }

  const candidates: Array<{ tweet: { id: string; text: string | null; urls: string[]; username?: string | null }; url: string }> = [];
  for (const tweet of tweets) {
    for (const candidateUrl of tweet.urls ?? []) {
      if (candidates.length >= maxExtractAttempts) break;
      candidates.push({ tweet, url: candidateUrl });
    }
    if (candidates.length >= maxExtractAttempts) break;
  }

  const filtered: typeof candidates = [];
  for (const candidate of candidates) {
    try {
      const host = new URL(candidate.url).hostname.replace(/^www\./, "").toLowerCase();
      if (["x.com", "twitter.com", "t.co"].includes(host)) continue;
      if (await isMarketplaceAdUrl(candidate.url)) continue;
      filtered.push(candidate);
    } catch {}
  }

  const concurrency = Math.max(1, Math.min(Number(process.env.SMART_EXTRACT_CONCURRENCY || "6"), 12));
  let cursor = 0;
  const foundVideos: Array<any> = [];

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= filtered.length) return;
      const { tweet, url: candidateUrl } = filtered[index];
      const tweetId = String(tweet.id);
      if (!tweetId) continue;

      try {
        const directVideoUrl = await smartExtractVideoUrl(candidateUrl);
        if (!directVideoUrl) continue;

        if (directVideoUrl === candidateUrl) {
          try {
            const parsedDirect = new URL(directVideoUrl);
            const host = parsedDirect.hostname.replace(/^www\./, "").toLowerCase();
            const path = parsedDirect.pathname.toLowerCase();
            const looksDirect = path.includes(".mp4") || host.includes("imgvdy.com") || host.includes("slicedrive.com") || host.includes("vidzp.com") || host.includes("vyiz.de") || host.includes("vdaq.de") || host.includes("vdiz.de") || host.includes("vdap.de") || host.includes("vdfq.de") || host.includes("vhaq.de") || host.includes("vdgq.de") || host.includes("videy.co") || host.includes("twimg.co.in");
            if (!looksDirect) continue;
          } catch {
            continue;
          }
        }

        try {
          await assertRealVideoUrl(directVideoUrl);
        } catch (validationError) {
          console.log(`[MASS-GRAB] Skipping invalid video URL ${directVideoUrl}: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
          continue;
        }

        foundVideos.push({
          type: "video",
          originalUrl: directVideoUrl,
          sourceTweetId: tweetId,
          sourceText: tweet.text ? `${tweet.text}\n\n[external] ${candidateUrl}` : `[external] ${candidateUrl}`,
          targetUsername: tweet.username || fallbackUsername,
          extraVideoUrls: [],
          thumbnailUrl: tweetImages.get(tweetId) || null,
        });
      } catch {}
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, filtered.length) }, () => worker()));
  merged.push(...foundVideos);
  return merged;
}

function normalizeMediaUrlForDedupe(rawUrl: string | null | undefined): string {
  const raw = String(rawUrl ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    return `${url.hostname}${decodeURIComponent(url.pathname).replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.split("?")[0].split("#")[0].trim().toLowerCase();
  }
}

function parseXStatusUrl(statusUrl?: string): { username: string | null; tweetId: string | null; normalizedUrl: string | null } {
  if (!statusUrl?.trim()) return { username: null, tweetId: null, normalizedUrl: null };
  const raw = statusUrl.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const match = url.pathname.match(/^\/([^/]+)\/status(?:es)?\/(\d+)/i);
    if (!match) return { username: null, tweetId: null, normalizedUrl: url.toString() };
    return { username: match[1], tweetId: match[2], normalizedUrl: `https://x.com/${match[1]}/status/${match[2]}` };
  } catch {
    return { username: null, tweetId: null, normalizedUrl: raw };
  }
}

function parseXInput(raw: string): { url: string; tweetId: string | null; username: string | null; type: "status" | "profile" | "unknown" } {
  const text = raw.trim();
  const cleanHandle = text.match(/^@?([A-Za-z0-9_]{1,15})$/)?.[1];
  if (cleanHandle) return { url: `https://x.com/${cleanHandle}`, username: cleanHandle, tweetId: null, type: "profile" };

  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const statusMatch = url.pathname.match(/^\/([^/]+)\/status(?:es)?\/(\d+)/i);
    if (statusMatch) return { url: `https://x.com/${statusMatch[1]}/status/${statusMatch[2]}`, username: statusMatch[1], tweetId: statusMatch[2], type: "status" };

    const profileMatch = url.pathname.match(/^\/([^/?#]+)\/?$/i);
    const username = profileMatch?.[1];
    if (username && !["home", "explore", "search", "i", "settings", "messages", "notifications"].includes(username.toLowerCase())) {
      return { url: `https://x.com/${username}`, username, tweetId: null, type: "profile" };
    }

    return { url: url.toString(), username: null, tweetId: null, type: "unknown" };
  } catch {
    return { url: text, username: null, tweetId: null, type: "unknown" };
  }
}

router.post("/mass-grab-x", async (req, res) => {
  const { accountId, statusUrls, uploadToDood = false, uploadToStreamtape = false, scanReplies = true, doodApiKey, maxTweetsPerProfile = 50, progressId, background = false, skipOcr = false, lowMemoryMode = false } = req.body as {
    accountId?: number;
    statusUrls?: string;
    uploadToDood?: boolean;
    uploadToStreamtape?: boolean;
    scanReplies?: boolean;
    doodApiKey?: string;
    maxTweetsPerProfile?: number;
    progressId?: string;
    background?: boolean;
    skipOcr?: boolean;
    lowMemoryMode?: boolean;
  };

  // Background mode: queue job and return immediately
  if (background) {
    try {
      const jobId = await enqueueJob("mass-grab-x", {
        accountId,
        statusUrls,
        uploadToDood,
        uploadToStreamtape,
        scanReplies,
        doodApiKey,
        maxTweetsPerProfile,
      });
      return res.json({ ok: true, background: true, jobId, message: "Job queued. Check /api/background-jobs/" + jobId + " for progress." });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Failed to queue job." });
    }
  }

  // Foreground mode: process immediately (existing behavior)
  pushMassGrabProgress(progressId, "Starting mass grab...");

  const accountIdNum = Number(accountId);
  if (!accountIdNum || Number.isNaN(accountIdNum)) return res.status(400).json({ error: "Cookie account is required." });
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountIdNum));
  if (!account) return res.status(404).json({ error: "Account not found." });
  if (account.authMode !== "cookies") return res.status(400).json({ error: "Mass grab X requires cookie auth account." });

  const entries = (statusUrls ?? "").split(/[\n,]+/g).map((line) => line.trim()).filter(Boolean);
  if (entries.length === 0) return res.status(400).json({ error: "Paste at least one X profile URL, @username, or status URL." });

  // Low memory mode: use per-item DB lookups instead of loading entire table into RAM.
  // This trades slightly more DB queries for dramatically less memory usage.
  let existingKeys: Set<string>;
  let existingUrlKeys: Set<string>;
  let existingSourceTweetVideoKeys: Set<string>;

  if (lowMemoryMode) {
    // Lightweight mode: start with empty sets, check duplicates per-item via DB query
    existingKeys = new Set<string>();
    existingUrlKeys = new Set<string>();
    existingSourceTweetVideoKeys = new Set<string>();
  } else {
    const existing = await db.select({ originalUrl: mediaTable.originalUrl, sourceTweetId: mediaTable.sourceTweetId, type: mediaTable.type }).from(mediaTable);
    existingKeys = new Set(existing.map((item) => `${item.sourceTweetId ?? ""}|${item.originalUrl}`));
    existingUrlKeys = new Set(existing.map((item) => normalizeMediaUrlForDedupe(item.originalUrl)).filter(Boolean));
    existingSourceTweetVideoKeys = new Set(existing.filter((item) => item.type === "video" && item.sourceTweetId).map((item) => String(item.sourceTweetId)));
  }

  const results: any[] = [];
  let inserted = 0;
  let uploaded = 0;
  let failed = 0;
  let skippedDuplicates = 0;
  const profileTweetCount = Math.max(1, Math.min(Number(maxTweetsPerProfile) || 50, 100));
  const streamtapeTurboConcurrency = lowMemoryMode ? 1 : Math.max(1, Math.min(Number(process.env.STREAMTAPE_UPLOAD_CONCURRENCY || "2"), 5));

  /**
   * Check if a media item already exists in DB (lightweight per-item query).
   * Used in lowMemoryMode to avoid loading entire media table.
   */
  const checkDuplicateViaDb = async (originalUrl: string, sourceTweetId: string | null, type: string): Promise<boolean> => {
    if (!lowMemoryMode) return false; // Not needed in normal mode, sets are pre-loaded
    try {
      const normalizedUrl = normalizeMediaUrlForDedupe(originalUrl);
      // Check by exact URL match
      const byUrl = await db.execute(sql`
        SELECT 1 FROM media
        WHERE original_url = ${originalUrl}
        LIMIT 1
      `);
      if (((byUrl as any).rows ?? []).length > 0) return true;

      // Check by normalized URL (covers URL variants)
      if (normalizedUrl) {
        const byNorm = await db.execute(sql`
          SELECT 1 FROM media
          WHERE original_url ILIKE ${`%${normalizedUrl.split('/').pop() || ''}%`}
          LIMIT 1
        `);
        if (((byNorm as any).rows ?? []).length > 0) return true;
      }

      // Check by source tweet ID for videos (one video per tweet)
      if (type === "video" && sourceTweetId) {
        const byTweet = await db.execute(sql`
          SELECT 1 FROM media
          WHERE source_tweet_id = ${sourceTweetId} AND type = 'video'
          LIMIT 1
        `);
        if (((byTweet as any).rows ?? []).length > 0) return true;
      }

      return false;
    } catch {
      return false;
    }
  };

  const saveItems = async (items: any[], fallbackUsername: string | null, fallbackTweetId: string | null) => {
    // Collect image URLs used as thumbnails so we skip saving them as standalone items
    const thumbnailUrls = new Set(items.filter((i: any) => i.thumbnailUrl).map((i: any) => i.thumbnailUrl));

    const queue: Array<{
      item: any;
      key: string;
      urlKey: string;
      sourceTweetVideoKey: string;
    }> = [];

    for (const item of items) {
      // Skip standalone images that are used as video thumbnails
      if (item.type === "image" && thumbnailUrls.has(item.originalUrl)) continue;

      const key = `${item.sourceTweetId || fallbackTweetId || ""}|${item.originalUrl}`;
      const urlKey = normalizeMediaUrlForDedupe(item.originalUrl);
      const sourceTweetVideoKey = item.type === "video" && (item.sourceTweetId || fallbackTweetId)
        ? String(item.sourceTweetId || fallbackTweetId)
        : "";

      // In-memory set check (works for both modes — lowMemoryMode sets grow during this run)
      if (existingKeys.has(key) || existingUrlKeys.has(urlKey) || (sourceTweetVideoKey && existingSourceTweetVideoKeys.has(sourceTweetVideoKey))) {
        skippedDuplicates++;
        pushMassGrabProgress(progressId, `Skipped duplicate media: ${String(item.originalUrl).slice(0, 70)}...`);
        continue;
      }

      // In lowMemoryMode, also check DB directly (since sets started empty)
      if (lowMemoryMode) {
        const isDup = await checkDuplicateViaDb(item.originalUrl, item.sourceTweetId || fallbackTweetId, item.type);
        if (isDup) {
          skippedDuplicates++;
          existingKeys.add(key);
          if (urlKey) existingUrlKeys.add(urlKey);
          if (sourceTweetVideoKey) existingSourceTweetVideoKeys.add(sourceTweetVideoKey);
          pushMassGrabProgress(progressId, `Skipped duplicate media: ${String(item.originalUrl).slice(0, 70)}...`);
          continue;
        }
      }

      // Reserve dedupe keys immediately to avoid parallel duplicate processing.
      existingKeys.add(key);
      if (urlKey) existingUrlKeys.add(urlKey);
      if (sourceTweetVideoKey) existingSourceTweetVideoKeys.add(sourceTweetVideoKey);

      queue.push({ item, key, urlKey, sourceTweetVideoKey });
    }

    if (queue.length === 0) return 0;

    const workerCount = uploadToStreamtape ? streamtapeTurboConcurrency : 1;
    if (uploadToStreamtape && workerCount > 1) {
      pushMassGrabProgress(progressId, `Turbo upload enabled: ${workerCount} parallel Streamtape workers`);
    }

    let insertedForInput = 0;
    let cursor = 0;

    const runOne = async (entry: { item: any; key: string; urlKey: string; sourceTweetVideoKey: string }) => {
      const { item } = entry;
      let doodUrl: string | null = null;
      let doodStatus: string | null = item.type === "video" && uploadToDood ? "uploading" : null;
      let streamtapeUrl: string | null = null;
      let mirrorUrl: string | null = null;
      let finalOriginalUrl = item.originalUrl;
      let sourceText: string | null = item.sourceText ?? null;

      if (item.type === "image") {
        try {
          mirrorUrl = await mirrorImageToFreeimageHost(item.originalUrl);
          if (mirrorUrl) {
            finalOriginalUrl = mirrorUrl;
            sourceText = sourceText
              ? `${sourceText}\n\n[source-image] ${item.originalUrl}`
              : `[source-image] ${item.originalUrl}`;
            pushMassGrabProgress(progressId, `Image mirrored to freeimage.host: ${mirrorUrl}`);
          }
        } catch (error) {
          sourceText = sourceText
            ? `${sourceText}\n\n[freeimage-upload-error] ${error instanceof Error ? error.message : String(error)}`
            : `[freeimage-upload-error] ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      // OCR first so caption text is preserved even if upload provider is unstable.
      // Skip OCR in scheduled/lowMemory mode to reduce load and external API calls.
      if (!skipOcr && item.type === "video" && item.thumbnailUrl && !sourceText?.includes("[ocr]")) {
        try {
          pushMassGrabProgress(progressId, `Extracting text from thumbnail...`);
          const ocrText = await extractTextFromImage(item.thumbnailUrl);
          if (ocrText) {
            sourceText = sourceText ? `${sourceText}\n\n[ocr] ${ocrText}` : `[ocr] ${ocrText}`;
            pushMassGrabProgress(progressId, `OCR extracted: ${ocrText.slice(0, 50)}...`);
          }
        } catch (ocrError) {
          console.warn(`[OCR] Failed for ${item.thumbnailUrl}: ${ocrError instanceof Error ? ocrError.message : String(ocrError)}`);
        }
      }

      try {
        if (item.type === "video" && uploadToStreamtape) {
          pushMassGrabProgress(progressId, `Uploading video to Streamtape: ${String(item.originalUrl).slice(0, 70)}...`);
          streamtapeUrl = await uploadVideoToStreamtape(item.originalUrl);
          uploaded++;
          pushMassGrabProgress(progressId, `Streamtape OK: ${streamtapeUrl}`);
        }
      } catch (error) {
        failed++;
        pushMassGrabProgress(progressId, `Streamtape failed: ${error instanceof Error ? error.message : String(error)}`);
        sourceText = sourceText
          ? `${sourceText}\n\n[streamtape-error] ${error instanceof Error ? error.message : String(error)}`
          : `[streamtape-error] ${error instanceof Error ? error.message : String(error)}`;
      }

      try {
        if (item.type === "video" && uploadToDood) {
          pushMassGrabProgress(progressId, `Uploading video to DoodStream...`);
          const apiKey = await getDoodApiKey(doodApiKey);
          if (!apiKey) throw new Error("DoodStream API key is missing.");
          doodUrl = await uploadVideoToDoodRobust(apiKey, item.originalUrl);
          doodStatus = "done";
          uploaded++;
        }
      } catch (error) {
        doodStatus = "failed";
        failed++;
        sourceText = sourceText
          ? `${sourceText}\n\n[dood-upload-error] ${error instanceof Error ? error.message : String(error)}`
          : `[dood-upload-error] ${error instanceof Error ? error.message : String(error)}`;
      }

      const [created] = await db.insert(mediaTable).values({
        jobId: null,
        targetUsername: item.targetUsername || fallbackUsername || "manual",
        type: item.type,
        originalUrl: finalOriginalUrl,
        sourceTweetId: item.sourceTweetId || fallbackTweetId,
        sourceText,
        doodUrl,
        doodStatus,
        streamtapeUrl,
        thumbnailUrl: item.thumbnailUrl || null,
        mirrorUrl,
      }).returning();

      if (created) {
        inserted++;
        insertedForInput++;
      }
    };

    const worker = async () => {
      while (true) {
        const current = cursor;
        cursor += 1;
        if (current >= queue.length) return;
        const entry = queue[current];
        try {
          await runOne(entry);
        } catch (error) {
          failed++;
          // Release reservation if DB insert totally failed, so future runs can retry.
          existingKeys.delete(entry.key);
          if (entry.urlKey) existingUrlKeys.delete(entry.urlKey);
          if (entry.sourceTweetVideoKey) existingSourceTweetVideoKeys.delete(entry.sourceTweetVideoKey);
          pushMassGrabProgress(progressId, `Save media failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return insertedForInput;
  };

  for (const entry of entries.slice(0, 100)) {
    const parsed = parseXInput(entry);
    if (parsed.type === "unknown") {
      results.push({ url: entry, ok: false, error: "Invalid X profile/status URL." });
      failed++;
      continue;
    }

    try {
      if (parsed.type === "status" && parsed.tweetId) {
        pushMassGrabProgress(progressId, `Fetching status: ${parsed.url}`);
        const found = await fetchTweetMediaViaCookies(account, parsed.tweetId);
        pushMassGrabProgress(progressId, `Found ${found.items.length} media items in status`);
        let allTweets = found.tweet ? [{ ...found.tweet, username: found.tweet.username || parsed.username || "" }] : [];
        let enrichedItems = await appendExternalVideoItemsFromTweetUrls(
          found.items,
          allTweets,
          parsed.username || "",
          3,
        );

        // Scan replies for video links
        if (scanReplies) {
          try {
            pushMassGrabProgress(progressId, `Scanning replies for tweet ${parsed.tweetId}...`);
            const repliesData = await fetchTweetRepliesViaCookies(account, parsed.tweetId);
            if (repliesData.urls.length > 0) {
              pushMassGrabProgress(progressId, `Found ${repliesData.urls.length} URLs in ${repliesData.replies.length} replies`);
              console.log(`[MASS-GRAB] Found ${repliesData.urls.length} URLs in ${repliesData.replies.length} replies for tweet ${parsed.tweetId}`);
              const parentImages = enrichedItems.filter((i) => i.type === "image" && String(i.sourceTweetId) === String(parsed.tweetId));
              const parentThumbnail = parentImages[0]?.originalUrl || null;
              const replyVideoItems = await appendExternalVideoItemsFromTweetUrls(
                parentImages,
                repliesData.replies.map((r) => ({ ...r, username: r.username || "reply" })),
                parsed.username || "",
                10,
              );
              const newItems = replyVideoItems
                .filter((i) => !parentImages.includes(i))
                .map((i) => i.type === "video" && parentThumbnail && !i.thumbnailUrl ? { ...i, thumbnailUrl: parentThumbnail } : i);
              enrichedItems = [...enrichedItems, ...newItems];
            }
          } catch (replyError) {
            console.warn(`[MASS-GRAB] Reply scan failed for ${parsed.tweetId}: ${replyError instanceof Error ? replyError.message : String(replyError)}`);
          }
        }

        const insertedForTweet = await saveItems(enrichedItems, parsed.username, parsed.tweetId);
        results.push({ type: "status", url: parsed.url, tweetId: parsed.tweetId, ok: true, inserted: insertedForTweet, found: enrichedItems.length, skippedDuplicates });
        continue;
      }

      if (parsed.type === "profile" && parsed.username) {
        pushMassGrabProgress(progressId, `Fetching profile: @${parsed.username}`);
        const user = await fetchUserIdByScreenName(account, parsed.username);
        if (!user) throw new Error(`User @${parsed.username} not found.`);
        pushMassGrabProgress(progressId, `Found user: @${user.screenName}`);
        // Read followRepostSource setting
        let followRepost = true;
        try {
          const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
          followRepost = settings?.followRepostSource ?? true;
        } catch {}
        pushMassGrabProgress(progressId, `Fetching ${profileTweetCount} tweets (follow repost: ${followRepost})...`);
        const fetchCount = lowMemoryMode ? Math.max(profileTweetCount, 20) : Math.max(profileTweetCount * 3, 20);
        const found = await fetchUserTweetsViaCookies(account, user.id, fetchCount, followRepost);
        pushMassGrabProgress(progressId, `Found ${found.tweets.length} tweets, ${found.items.length} media items`);
        const limitedTweets = found.tweets.slice(0, profileTweetCount).map((tweet) => ({ ...tweet, username: user.screenName || parsed.username }));
        const allowedTweetIds = new Set(limitedTweets.map((tweet) => String(tweet.id)));
        const limitedItems = found.items.filter((item) => allowedTweetIds.has(String(item.sourceTweetId)));
        let enrichedItems = await appendExternalVideoItemsFromTweetUrls(limitedItems, limitedTweets, user.screenName || parsed.username, Math.max(5, Math.min(profileTweetCount, 20)));

        // Scan replies for each tweet in profile mode
        // In lowMemoryMode, limit reply scanning to first 5 tweets to reduce API calls
        if (scanReplies) {
          const tweetsToScanReplies = lowMemoryMode ? limitedTweets.slice(0, 5) : limitedTweets;
          pushMassGrabProgress(progressId, `Scanning replies for ${tweetsToScanReplies.length} tweets...`);
          for (const tweet of tweetsToScanReplies) {
            try {
              const repliesData = await fetchTweetRepliesViaCookies(account, tweet.id);
              if (repliesData.urls.length > 0) {
                pushMassGrabProgress(progressId, `Tweet ${tweet.id}: found ${repliesData.urls.length} URLs in replies`);
                console.log(`[MASS-GRAB] Found ${repliesData.urls.length} URLs in replies for tweet ${tweet.id} (@${user.screenName})`);
                // Pass parent tweet images as base so reply videos can use them as thumbnails
                const parentImages = enrichedItems.filter((i) => i.type === "image" && String(i.sourceTweetId) === String(tweet.id));
                const replyVideoItems = await appendExternalVideoItemsFromTweetUrls(
                  parentImages,
                  repliesData.replies.map((r) => ({ ...r, username: r.username || "reply" })),
                  user.screenName || parsed.username,
                  5,
                );
                // Only add new video items (not the parent images we passed in)
                const parentThumbnail = parentImages[0]?.originalUrl || null;
                const newItems = replyVideoItems
                  .filter((i) => !parentImages.includes(i))
                  .map((i) => i.type === "video" && parentThumbnail && !i.thumbnailUrl ? { ...i, thumbnailUrl: parentThumbnail } : i);
                enrichedItems = [...enrichedItems, ...newItems];
              }
            } catch (replyError) {
              console.warn(`[MASS-GRAB] Reply scan failed for tweet ${tweet.id}: ${replyError instanceof Error ? replyError.message : String(replyError)}`);
            }
          }
        }

        const insertedForProfile = await saveItems(enrichedItems, user.screenName || parsed.username, null);
        results.push({ type: "profile", url: parsed.url, username: user.screenName || parsed.username, ok: true, scannedTweets: limitedTweets.length, found: enrichedItems.length, inserted: insertedForProfile, skippedDuplicates });
      }
    } catch (error) {
      failed++;
      results.push({ type: parsed.type, url: parsed.url, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  res.json({ ok: true, inserted, uploaded, failed, skippedDuplicates, results });
});

router.post("/retry-streamtape", async (req, res) => {
  try {
    const { ids } = req.body as { ids?: number[] };
    let rows: { id: number; original_url: string }[] = [];
    
    if (ids && ids.length > 0) {
      // Retry specific IDs
      for (const id of ids) {
        const result = await db.select({ id: mediaTable.id, originalUrl: mediaTable.originalUrl })
          .from(mediaTable)
          .where(and(eq(mediaTable.type, "video"), eq(mediaTable.id, id), sql`${mediaTable.streamtapeUrl} IS NULL`));
        if (result.length > 0) rows.push({ id: result[0].id, original_url: result[0].originalUrl! });
      }
    } else {
      // Retry all missing
      const result = await db.select({ id: mediaTable.id, originalUrl: mediaTable.originalUrl })
        .from(mediaTable)
        .where(and(eq(mediaTable.type, "video"), sql`${mediaTable.streamtapeUrl} IS NULL`, sql`${mediaTable.originalUrl} IS NOT NULL`))
        .orderBy(mediaTable.id);
      rows = result.map(r => ({ id: r.id, original_url: r.originalUrl! }));
    }
    
    if (rows.length === 0) return res.json({ ok: true, message: "No videos need Streamtape upload.", retried: 0, success: 0, failed: 0 });

    let success = 0;
    let failed = 0;
    const concurrency = Math.max(1, Math.min(Number(process.env.STREAMTAPE_UPLOAD_CONCURRENCY || "2"), 5));
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= rows.length) return;
        const row = rows[idx];
        try {
          const streamtapeUrl = await uploadVideoToStreamtape(row.original_url);
          await db.update(mediaTable).set({ streamtapeUrl }).where(eq(mediaTable.id, row.id));
          // Clean streamtape-error from source_text
          await db.execute(sql`
            UPDATE media SET source_text = regexp_replace(source_text, E'\\n*\\[streamtape-error\\][^\\n]*', '', 'g') WHERE id = ${row.id}
          `);
          success++;
        } catch (error) {
          failed++;
          const errMsg = error instanceof Error ? error.message : String(error);
          console.warn(`[RETRY-STREAMTAPE] Failed ID ${row.id}: ${errMsg}`);
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return res.json({ ok: true, retried: rows.length, success, failed });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Retry failed." });
  }
});

// POST /api/media/retry-streamtape-background — Queue background retry for all videos without streamtape
let retryStreamtapeBgRunning = false;
let retryStreamtapeBgProgress = { total: 0, processed: 0, success: 0, failed: 0, running: false };

router.get("/retry-streamtape-background/status", (_req, res) => {
  return res.json({ ok: true, ...retryStreamtapeBgProgress });
});

router.post("/retry-streamtape-background", async (_req, res) => {
  if (retryStreamtapeBgRunning) {
    return res.json({ ok: true, message: "Already running.", ...retryStreamtapeBgProgress });
  }

  const rows = await db.select({ id: mediaTable.id, originalUrl: mediaTable.originalUrl })
    .from(mediaTable)
    .where(and(eq(mediaTable.type, "video"), sql`${mediaTable.streamtapeUrl} IS NULL`, sql`${mediaTable.originalUrl} IS NOT NULL`))
    .orderBy(mediaTable.id);

  if (rows.length === 0) {
    return res.json({ ok: true, message: "No videos need Streamtape upload.", total: 0 });
  }

  retryStreamtapeBgRunning = true;
  retryStreamtapeBgProgress = { total: rows.length, processed: 0, success: 0, failed: 0, running: true };

  res.json({ ok: true, message: `Started background processing ${rows.length} videos.`, total: rows.length });

  // Process one by one in background
  void (async () => {
    for (const row of rows) {
      if (!retryStreamtapeBgRunning) break; // Allow cancel
      try {
        const streamtapeUrl = await uploadVideoToStreamtape(row.originalUrl!);
        await db.update(mediaTable).set({ streamtapeUrl }).where(eq(mediaTable.id, row.id));
        await db.execute(sql`
          UPDATE media SET source_text = regexp_replace(source_text, E'\\n*\\[streamtape-error\\][^\\n]*', '', 'g') WHERE id = ${row.id}
        `);
        retryStreamtapeBgProgress.success++;
      } catch (error) {
        retryStreamtapeBgProgress.failed++;
        console.warn(`[RETRY-BG] Failed ID ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
      retryStreamtapeBgProgress.processed++;

      // Delay 5s between each to avoid overload
      if (retryStreamtapeBgRunning) await new Promise(r => setTimeout(r, 5000));
    }
    retryStreamtapeBgRunning = false;
    retryStreamtapeBgProgress.running = false;
  })();
});

router.post("/retry-streamtape-background/cancel", (_req, res) => {
  retryStreamtapeBgRunning = false;
  retryStreamtapeBgProgress.running = false;
  return res.json({ ok: true, message: "Cancelled." });
});

// POST /api/media/mass-regrab-background — Re-grab videos for media that only have images (no video URL/streamtape)
let massRegrabRunning = false;
let massRegrabProgress = { total: 0, processed: 0, success: 0, failed: 0, running: false };

router.get("/mass-regrab-background/status", (_req, res) => {
  return res.json({ ok: true, ...massRegrabProgress });
});

router.post("/mass-regrab-background", async (req, res) => {
  if (massRegrabRunning) {
    return res.json({ ok: true, message: "Already running.", ...massRegrabProgress });
  }

  const { accountId } = req.body as { accountId?: number };
  if (!accountId) return res.status(400).json({ ok: false, error: "Account ID is required." });

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
  if (!account) return res.status(404).json({ ok: false, error: "Account not found." });
  if (account.authMode !== "cookies") return res.status(400).json({ ok: false, error: "Requires cookie auth account." });

  // Find all source tweet IDs that have images but NO video counterpart with streamtape
  const allMedia = await db.select({
    id: mediaTable.id,
    type: mediaTable.type,
    sourceTweetId: mediaTable.sourceTweetId,
    streamtapeUrl: mediaTable.streamtapeUrl,
    originalUrl: mediaTable.originalUrl,
  }).from(mediaTable).where(sql`${mediaTable.sourceTweetId} IS NOT NULL`);

  // Group by sourceTweetId
  const tweetGroups = new Map<string, { hasVideo: boolean; hasStreamtape: boolean }>();
  for (const m of allMedia) {
    const tid = String(m.sourceTweetId);
    const group = tweetGroups.get(tid) || { hasVideo: false, hasStreamtape: false };
    if (m.type === "video") group.hasVideo = true;
    if (m.streamtapeUrl) group.hasStreamtape = true;
    tweetGroups.set(tid, group);
  }

  // Tweets that have media but no video with streamtape
  const tweetsToRegrab = [...tweetGroups.entries()]
    .filter(([_, g]) => !g.hasStreamtape)
    .map(([tid]) => tid);

  if (tweetsToRegrab.length === 0) {
    return res.json({ ok: true, message: "All media already have video URLs.", total: 0 });
  }

  massRegrabRunning = true;
  massRegrabProgress = { total: tweetsToRegrab.length, processed: 0, success: 0, failed: 0, running: true };

  res.json({ ok: true, message: `Started re-grabbing ${tweetsToRegrab.length} tweets in background. Process runs slowly to avoid server overload.`, total: tweetsToRegrab.length });

  // Process ONE tweet at a time — slow but reliable, won't overload server
  void (async () => {
    for (let i = 0; i < tweetsToRegrab.length; i++) {
      if (!massRegrabRunning) break;

      const tweetId = tweetsToRegrab[i];
      const statusUrl = `https://x.com/i/status/${tweetId}`;

      try {
        const response = await fetch(`http://127.0.0.1:${process.env.PORT || 5002}/api/media/mass-grab-x`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            statusUrls: statusUrl,
            uploadToStreamtape: true,
            uploadToDood: false,
            scanReplies: true,
            maxTweetsPerProfile: 3,
            skipOcr: true,
            lowMemoryMode: true,
          }),
          signal: AbortSignal.timeout(10 * 60 * 1000),
        });

        if (response.ok) {
          await response.json().catch(() => null);
          const verifyRows = await db.select({ id: mediaTable.id }).from(mediaTable).where(sql`${mediaTable.sourceTweetId} = ${tweetId} AND ${mediaTable.streamtapeUrl} IS NOT NULL AND ${mediaTable.streamtapeUrl} <> ''`).limit(1);
          if (verifyRows.length > 0) {
            massRegrabProgress.success++;
          } else {
            massRegrabProgress.failed++;
            console.warn(`[MASS-REGRAB] No Streamtape produced for tweet ${tweetId}`);
          }
        } else {
          massRegrabProgress.failed++;
          const errData = await response.json().catch(() => null) as { error?: string } | null;
          console.warn(`[MASS-REGRAB] Failed tweet ${tweetId}: ${errData?.error || response.status}`);
        }
      } catch (error) {
        massRegrabProgress.failed++;
        console.warn(`[MASS-REGRAB] Error tweet ${tweetId}: ${error instanceof Error ? error.message : String(error)}`);
      }

      massRegrabProgress.processed++;

      // Long delay between each tweet (30 seconds) — slow but safe
      if (massRegrabRunning && i < tweetsToRegrab.length - 1) {
        await new Promise(r => setTimeout(r, 30_000));
      }
    }

    massRegrabRunning = false;
    massRegrabProgress.running = false;
    console.log(`[MASS-REGRAB] Completed: ${massRegrabProgress.processed} processed, ${massRegrabProgress.success} videos grabbed, ${massRegrabProgress.failed} failed`);
  })();
});

router.post("/mass-regrab-background/cancel", (_req, res) => {
  massRegrabRunning = false;
  massRegrabProgress.running = false;
  return res.json({ ok: true, message: "Cancelled." });
});

router.post("/manual", async (req, res) => {
  const {
    imageUrl,
    videoUrl,
    statusUrl,
    doodUrl: providedDoodUrl,
    targetUsername = "manual",
    doodApiKey,
    autoEmbed = false,
  } = req.body as {
    imageUrl?: string;
    videoUrl?: string;
    statusUrl?: string;
    doodUrl?: string;
    targetUsername?: string;
    doodApiKey?: string;
    autoEmbed?: boolean;
  };

  if (!imageUrl?.trim() && !videoUrl?.trim()) {
    return res.status(400).json({ error: "At least one of imageUrl or videoUrl is required." });
  }

  const parsedStatus = parseXStatusUrl(statusUrl);
  const finalTargetUsername = parsedStatus.username ?? (targetUsername.trim() || "manual");
  const finalSourceTweetId = parsedStatus.tweetId;
  const finalSourceText = parsedStatus.normalizedUrl ? `Manual source status: ${parsedStatus.normalizedUrl}` : null;
  const cleanProvidedDoodUrl = providedDoodUrl?.trim() || null;

  const results: {
    image?: { id: number; originalUrl: string; sourceUrl?: string | null };
    video?: { id: number; originalUrl: string; doodUrl: string | null; doodStatus: string; embedUrl: string | null; sourceUrl?: string | null };
    error?: string;
  } = {};

  if (imageUrl?.trim()) {
    let finalImageUrl = imageUrl.trim();
    let mirrorUrl: string | null = null;
    let imageSourceText = finalSourceText;
    try {
      mirrorUrl = await mirrorImageToFreeimageHost(finalImageUrl);
      if (mirrorUrl) {
        imageSourceText = imageSourceText
          ? `${imageSourceText}\n\n[source-image] ${finalImageUrl}`
          : `[source-image] ${finalImageUrl}`;
        finalImageUrl = mirrorUrl;
      }
    } catch (error) {
      imageSourceText = imageSourceText
        ? `${imageSourceText}\n\n[freeimage-upload-error] ${error instanceof Error ? error.message : String(error)}`
        : `[freeimage-upload-error] ${error instanceof Error ? error.message : String(error)}`;
    }

    const [imageItem] = await db.insert(mediaTable).values({
      jobId: null,
      targetUsername: finalTargetUsername,
      type: "image",
      originalUrl: finalImageUrl,
      sourceTweetId: finalSourceTweetId,
      sourceText: imageSourceText,
      mirrorUrl,
    }).returning();
    if (imageItem) {
      results.image = { id: imageItem.id, originalUrl: imageItem.originalUrl, sourceUrl: parsedStatus.normalizedUrl };
    }
  }

  if (videoUrl?.trim()) {
    const hasDoodInput = Boolean(cleanProvidedDoodUrl);
    const hasUploadKey = Boolean(await getDoodApiKey(doodApiKey));
    const [videoItem] = await db.insert(mediaTable).values({
      jobId: null,
      targetUsername: finalTargetUsername,
      type: "video",
      originalUrl: videoUrl.trim(),
      sourceTweetId: finalSourceTweetId,
      sourceText: finalSourceText,
      doodUrl: cleanProvidedDoodUrl,
      doodStatus: hasDoodInput ? "done" : hasUploadKey ? "uploading" : null,
    }).returning();

    if (videoItem) {
      let doodUrl: string | null = cleanProvidedDoodUrl;
      let doodStatus = videoItem.doodStatus;
      let embedUrl: string | null = null;
      let uploadError: string | null = null;

      const resolvedDoodApiKey = await getDoodApiKey(doodApiKey);
      if (!cleanProvidedDoodUrl && resolvedDoodApiKey) {
        try {
          doodUrl = await uploadVideoToDoodRobust(resolvedDoodApiKey, videoUrl.trim());
          doodStatus = "done";

          if (autoEmbed) {
            embedUrl = await buildEmbedForDood(doodUrl, `Manual: ${finalTargetUsername} #${videoItem.id}`);
          }

          await db.update(mediaTable).set({ doodUrl, doodStatus: "done" }).where(eq(mediaTable.id, videoItem.id));
        } catch (err) {
          uploadError = err instanceof Error ? err.message : "DoodStream upload failed.";
          doodStatus = "failed";
          await db.update(mediaTable).set({ doodStatus: "failed" }).where(eq(mediaTable.id, videoItem.id));
        }
      } else if (cleanProvidedDoodUrl && autoEmbed) {
        embedUrl = await buildEmbedForDood(cleanProvidedDoodUrl, `Manual: ${finalTargetUsername} #${videoItem.id}`);
      }

      results.video = {
        id: videoItem.id,
        originalUrl: videoItem.originalUrl,
        doodUrl,
        doodStatus: doodStatus ?? "none",
        embedUrl,
        sourceUrl: parsedStatus.normalizedUrl,
      };

      if (uploadError) {
        results.error = uploadError;
      }
    }
  }

  res.status(201).json(results);
});

router.post("/:id/post-to-x", async (req, res) => {
  try {
    const mediaId = Number(req.params.id);
    const accountId = Number(req.body?.accountId);
    const caption = String(req.body?.caption ?? "").trim();
    const uploadImage = Boolean(req.body?.uploadImage ?? true);

    if (!mediaId || Number.isNaN(mediaId)) return res.status(400).json({ ok: false, error: "Media ID is required." });
    if (!accountId || Number.isNaN(accountId)) return res.status(400).json({ ok: false, error: "Account ID is required." });

    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) return res.status(404).json({ ok: false, error: "Account not found." });
    if (account.authMode !== "cookies") return res.status(400).json({ ok: false, error: "Post to X requires cookie auth account." });

    const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, mediaId));
    if (!media) return res.status(404).json({ ok: false, error: "Media not found." });

    // Build caption
    const lines: string[] = [];
    if (caption) {
      lines.push(caption);
    } else if (media.sourceText) {
      const ocrMatch = media.sourceText.match(/\[ocr\]\s*(.+)$/ims);
      if (ocrMatch?.[1]) {
        lines.push(ocrMatch[1].trim().slice(0, 180));
      } else {
        const firstLine = media.sourceText.split("\n").find((line) => line.trim() && !line.includes("t.co") && !line.startsWith("[external]"));
        if (firstLine) lines.push(firstLine.trim().slice(0, 180));
      }
    }

    // Add link (streamtape > dood > original)
    if (media.streamtapeUrl) {
      lines.push(media.streamtapeUrl);
    } else if (media.doodUrl) {
      lines.push(media.doodUrl);
    }

    const text = lines.join("\n\n").slice(0, 270);

    // Upload image/thumbnail if available
    let mediaIds: string[] = [];
    if (uploadImage) {
      const imageUrl = media.type === "image" ? media.originalUrl : media.thumbnailUrl;
      if (imageUrl) {
        try {
          const imgResponse = await fetch(imageUrl);
          if (imgResponse.ok) {
            const buffer = Buffer.from(await imgResponse.arrayBuffer());
            const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
            const uploadedMediaId = await uploadMediaViaCookies(account, buffer, contentType);
            mediaIds.push(uploadedMediaId);
          }
        } catch (uploadErr) {
          console.warn(`[PostToX] Failed to upload image: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}`);
        }
      }
    }

    const tweetId = await createTweetViaCookies(account, text, mediaIds);

    await db.insert(postsTable).values({
      accountId,
      content: text,
      insertLink: media.streamtapeUrl || media.doodUrl || media.originalUrl,
      mediaId,
      scheduledAt: new Date(),
      status: "posted",
      postedAt: new Date(),
      xPostId: tweetId,
    }).returning().catch(() => []);

    return res.json({ ok: true, tweetId, text, hasImage: mediaIds.length > 0 });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to post media." });
  }
});

export default router;

// Test endpoint to verify backend is updated
router.get("/extract-test", async (_req, res) => {
  res.json({
    message: "Backend updated and running",
    timestamp: new Date().toISOString(),
    autoHttpsEnabled: true,
    ytdlpPath: await resolveYtdlpPath(),
  });
});
