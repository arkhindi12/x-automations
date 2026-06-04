import { Router } from "express";
import { createHmac, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, unlink, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db } from "@workspace/db";
import { jobsTable, accountsTable, targetsTable, activityTable, mediaTable, postsTable, embedsTable, settingsTable, affiliateLinksTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { CreateJobBody, GetJobParams, UpdateJobParams, DeleteJobParams, ToggleJobParams, RunJobNowParams } from "@workspace/api-zod";
import { smartExtractVideoUrl } from "../lib/smart-extractor";
import { fetchUserIdByScreenName, fetchUserTweetsViaCookies, fetchHomeTimelineViaCookies, searchTweetsViaCookies, type WebTimelineMedia } from "../lib/x-web-client";
import { jobActionLimiter, jobCreationLimiter } from "../lib/rate-limiter";
import { jobLogger, logger } from "../lib/structured-logger";

const router = Router();

type XApiUrl = {
  url?: string;
  expanded_url?: string;
  unwound_url?: string;
};

type XApiTweet = {
  id: string;
  author_id?: string;
  text?: string;
  referenced_tweets?: Array<{ type: string; id: string }>;
  attachments?: { media_keys?: string[] };
  entities?: { urls?: XApiUrl[] };
};

type XApiMedia = {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
};

type XApiUser = {
  id: string;
  username?: string;
};

type XApiResponse<T> = {
  data?: T;
  includes?: { media?: XApiMedia[]; users?: XApiUser[] };
  errors?: Array<{ detail?: string; title?: string }>;
  detail?: string;
  title?: string;
};

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader(account: typeof accountsTable.$inferSelect, method: string, url: string, queryParams: URLSearchParams) {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: account.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: account.accessToken,
    oauth_version: "1.0",
  };

  const signatureParams = new URLSearchParams(queryParams);
  for (const [key, value] of Object.entries(oauthParams)) {
    signatureParams.append(key, value);
  }

  const parameterString = Array.from(signatureParams.entries())
    .sort(([keyA, valueA], [keyB, valueB]) => keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");

  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(parameterString),
  ].join("&");

  const signingKey = `${percentEncode(account.apiSecret)}&${percentEncode(account.accessTokenSecret)}`;
  oauthParams.oauth_signature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  return `OAuth ${Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`;
}

type DoodUploadResponse = {
  status?: number;
  msg?: string;
  result?: string | {
    filecode?: string;
    file_code?: string;
    download_url?: string;
    embed_url?: string;
    protected_embed?: string;
    upload_url?: string;
    url?: string;
  };
};

export type JobRunResult = {
  inserted: number;
  uploaded: number;
  uploadFailed: number;
  postsQueued: number;
};

type MediaCandidate = {
  type: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  targetUsername: string;
  sourceTweetId: string | null;
  sourceText: string | null;
  doodStatus: string | null;
};

async function getJobWithNames(id: number) {
  const [job] = await db.select({
    id: jobsTable.id,
    name: jobsTable.name,
    accountId: jobsTable.accountId,
    targetId: jobsTable.targetId,
    accountUsername: accountsTable.username,
    targetUsername: targetsTable.xUsername,
    mediaSource: jobsTable.mediaSource,
    savedMediaId: jobsTable.savedMediaId,
    scheduleType: jobsTable.scheduleType,
    scheduleValue: jobsTable.scheduleValue,
    grabImages: jobsTable.grabImages,
    grabVideos: jobsTable.grabVideos,
    includeReplies: jobsTable.includeReplies,
    extractLinksFromReplies: jobsTable.extractLinksFromReplies,
    allowedVideoDomains: jobsTable.allowedVideoDomains,
    uploadToDood: jobsTable.uploadToDood,
    doodApiKey: jobsTable.doodApiKey,
    postToX: jobsTable.postToX,
    postTemplate: jobsTable.postTemplate,
    insertLink: jobsTable.insertLink,
    isActive: jobsTable.isActive,
    lastRun: jobsTable.lastRun,
    nextRun: jobsTable.nextRun,
    runsCount: jobsTable.runsCount,
    status: jobsTable.status,
    createdAt: jobsTable.createdAt,
    proxyList: jobsTable.proxyList,
    aiEnabled: jobsTable.aiEnabled,
    aiProvider: jobsTable.aiProvider,
    aiApiKey: jobsTable.aiApiKey,
    aiPrompt: jobsTable.aiPrompt,
    repostEnabled: jobsTable.repostEnabled,
    primeTimeHours: jobsTable.primeTimeHours,
    repostTargetAccountId: jobsTable.repostTargetAccountId,
    autoEmbed: jobsTable.autoEmbed,
    keywordFilter: jobsTable.keywordFilter,
    grabExternalLinksOnly: jobsTable.grabExternalLinksOnly,
    watermarkEnabled: jobsTable.watermarkEnabled,
    watermarkType: jobsTable.watermarkType,
    watermarkText: jobsTable.watermarkText,
    watermarkFontSize: jobsTable.watermarkFontSize,
    watermarkFontWeight: jobsTable.watermarkFontWeight,
    watermarkColor: jobsTable.watermarkColor,
    watermarkOpacity: jobsTable.watermarkOpacity,
    watermarkPosition: jobsTable.watermarkPosition,
    watermarkLogoUrl: jobsTable.watermarkLogoUrl,
  })
    .from(jobsTable)
    .leftJoin(accountsTable, eq(jobsTable.accountId, accountsTable.id))
    .leftJoin(targetsTable, eq(jobsTable.targetId, targetsTable.id))
    .where(eq(jobsTable.id, id));
  return job;
}

function parseNotAllowedDomains(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
}

function isNotAllowedUrl(url: string, notAllowedDomains: string[]) {
  if (notAllowedDomains.length === 0) return false;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return notAllowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function extractTextUrls(text: string | undefined) {
  if (!text) return [];
  const httpUrls = Array.from(text.matchAll(/https?:\/\/[^\s<>"]+/g))
    .map((match) => match[0].replace(/[),.;!?]+$/, ""));

  // Also catch bare links without protocol, e.g. vidoi.de/e/xxx or cdn2.sjicedrive.com/xxx.mp4
  const bareUrls = Array.from(text.matchAll(/(?:[a-z0-9-]+\.)+[a-z]{2,}\/[\w./?=&%#:+-]+/gi))
    .map((match) => match[0].replace(/[),.;!?]+$/, ""))
    .map((url) => /^https?:\/\//i.test(url) ? url : `https://${url}`);

  return Array.from(new Set([...httpUrls, ...bareUrls]));
}

function isLikelyExternalVideoLink(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    // t.co is Twitter's URL shortener - these redirect to external sites, so allow them
    if (host === "t.co") return true;
    return !["x.com", "twitter.com"].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function isDirectMp4Url(url: string) {
  try {
    const parsed = new URL(url);
    return /\.mp4(?:$|[?#])/i.test(parsed.pathname + parsed.search + parsed.hash);
  } catch {
    return /\.mp4(?:$|[?#])/i.test(url);
  }
}

function shouldGrabDirectMp4Only(keywordFilter: string | null | undefined) {
  return /(^|[\s,])mp4([\s,]|$)/i.test(keywordFilter ?? "");
}

function keywordFilterMatches(text: string | null | undefined, keywordFilter: string | null | undefined) {
  const keywords = keywordFilter
    ? keywordFilter.split(",").map((keyword) => keyword.trim().toLowerCase()).filter(Boolean)
    : [];
  if (keywords.length === 0) return true;
  const lowerText = (text ?? "").toLowerCase();
  return keywords.some((keyword) => lowerText.includes(keyword));
}

function stripUrlsFromText(text: string | null) {
  return (text ?? "")
    .replace(/https?:\/\/[^\s<>"]+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTweetUrls(tweet: XApiTweet) {
  const entityUrls = tweet.entities?.urls?.flatMap((item) => [item.unwound_url, item.expanded_url, item.url].filter(Boolean) as string[]) ?? [];
  return Array.from(new Set([...entityUrls, ...extractTextUrls(tweet.text)]));
}

function toDoodWatchUrl(payload: DoodUploadResponse) {
  const result = payload.result;
  if (typeof result === "string") {
    return result.startsWith("http") ? result : null;
  }

  const directUrl = result?.download_url ?? result?.embed_url ?? result?.protected_embed;
  if (directUrl) return directUrl;

  const fileCode = result?.filecode ?? result?.file_code;
  return fileCode ? `https://dood.stream/d/${fileCode}` : null;
}


function scheduleDownloadedFileDeletion(filePath: string) {
  setTimeout(() => {
    unlink(filePath).catch(() => undefined);
  }, 10 * 60 * 1000).unref();
}

/** Periodic cleanup for orphaned temp files (crash recovery safety net) */
async function cleanupStaleTempDownloads() {
  const downloadDir = path.join(os.tmpdir(), "x-automation-downloads");
  try {
    const files = await readdir(downloadDir);
    let removed = 0;
    const now = Date.now();
    for (const file of files) {
      try {
        const filePath = path.join(downloadDir, file);
        const fileStat = await stat(filePath);
        if (now - fileStat.mtimeMs > 15 * 60 * 1000) {
          await unlink(filePath).catch(() => undefined);
          removed++;
        }
      } catch { /* skip */ }
    }
    if (removed > 0) console.log(`[TEMP-CLEANUP] Removed ${removed} stale file(s) from ${downloadDir}`);
  } catch { /* dir not found */ }
}
setInterval(cleanupStaleTempDownloads, 5 * 60 * 1000).unref();
setTimeout(cleanupStaleTempDownloads, 10_000).unref();

async function downloadVideoToTempFile(videoUrl: string): Promise<string> {
  const downloadDir = path.join(os.tmpdir(), "x-automation-downloads");
  await mkdir(downloadDir, { recursive: true });

  const filename = `${Date.now()}-${randomBytes(8).toString("hex")}.mp4`;
  const filePath = path.join(downloadDir, filename);

  const response = await fetch(videoUrl, {
    headers: {
      Accept: "video/mp4,video/*,*/*",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Video download failed with HTTP ${response.status}.`);
  }

  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(filePath));
  return filePath;
}

function getDoodUploadServer(payload: DoodUploadResponse): string | null {
  const result = payload.result;
  if (typeof result === "string") return result.startsWith("http") ? result : null;
  return result?.upload_url ?? result?.url ?? null;
}

async function getDoodUploadServerUrl(apiKey: string): Promise<string> {
  const endpoint = new URL("https://doodapi.com/api/upload/server");
  endpoint.searchParams.set("key", apiKey);

  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => null) as DoodUploadResponse | null;

  if (!response.ok || !payload) {
    throw new Error(`DoodStream upload server lookup failed with HTTP ${response.status}.`);
  }
  if (payload.status && payload.status >= 400) {
    throw new Error(payload.msg ?? "DoodStream upload server lookup failed.");
  }

  const uploadUrl = getDoodUploadServer(payload);
  if (!uploadUrl) {
    throw new Error(payload.msg ?? "DoodStream did not return an upload server URL.");
  }
  return uploadUrl;
}

async function uploadFileToDood(apiKey: string | null, filePath: string) {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey) {
    throw new Error("DoodStream API key is missing for this job.");
  }

  const uploadUrl = await getDoodUploadServerUrl(trimmedKey);
  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer], { type: "video/mp4" }), path.basename(filePath));

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
    signal: AbortSignal.timeout(300000),
  });
  const payload = await response.json().catch(() => null) as DoodUploadResponse | null;

  if (!response.ok || !payload) {
    throw new Error(`DoodStream file upload failed with HTTP ${response.status}.`);
  }
  if (payload.status && payload.status >= 400) {
    throw new Error(payload.msg ?? "DoodStream file upload failed.");
  }

  const doodUrl = toDoodWatchUrl(payload);
  if (!doodUrl) {
    throw new Error(payload.msg ?? "DoodStream did not return a usable video URL after file upload.");
  }
  return doodUrl;
}

async function downloadAndUploadVideoToDood(apiKey: string | null, originalUrl: string) {
  const directVideoUrl = await smartExtractVideoUrl(originalUrl);
  const localPath = await downloadVideoToTempFile(directVideoUrl);

  try {
    const doodUrl = await uploadFileToDood(apiKey, localPath);
    scheduleDownloadedFileDeletion(localPath);
    return { doodUrl, localPath };
  } catch (error) {
    await unlink(localPath).catch(() => undefined);
    throw error;
  }
}

async function generateAICaption(job: typeof jobsTable.$inferSelect, sourceText: string | null): Promise<string | null> {
  if (!job.aiEnabled || !job.aiApiKey?.trim()) return null;

  const systemPrompt = job.aiPrompt?.trim() || "You are a social media writer. Generate an engaging, natural caption for a video post. Keep it concise (under 200 characters). Output only the caption text, no quotes or extra formatting.";
  const userMessage = sourceText?.trim()
    ? `Original tweet: ${sourceText.trim()}`
    : "Generate a short, engaging caption for a video post.";

  const provider = job.aiProvider || "openai";
  const apiKey = job.aiApiKey.trim();
  const endpoint = provider === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = provider === "groq" ? "llama3-8b-8192" : "gpt-4o-mini";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
        max_tokens: 150,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Generate a unique affiliate redirect link.
 * Creates a NEW redirect entry in DB every time — so each post gets a unique code
 * but all redirect to the same destination URL.
 * Format: https://domain/r/code.mp4
 */
async function getRandomAffiliateLink(userId?: number | null, usedCodes?: Set<string>): Promise<string> {
  try {
    // Get a random active affiliate to use as destination template
    let links;
    if (userId) {
      links = await db.select().from(affiliateLinksTable).where(and(eq(affiliateLinksTable.isActive, true), eq(affiliateLinksTable.userId, userId)));
    } else {
      links = await db.select().from(affiliateLinksTable).where(eq(affiliateLinksTable.isActive, true));
    }
    if (links.length === 0) return "";

    // Round-robin pick destination
    links.sort((a, b) => {
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      return aTime - bTime;
    });
    const sourceLink = links[0];
    await db.update(affiliateLinksTable).set({ lastUsedAt: new Date() }).where(eq(affiliateLinksTable.id, sourceLink.id));

    // Generate a unique code for this post
    let code = generateEmbedCode(8);
    for (let i = 0; i < 5; i++) {
      const existing = await db.select({ id: affiliateLinksTable.id }).from(affiliateLinksTable).where(eq(affiliateLinksTable.code, code));
      if (existing.length === 0) break;
      code = generateEmbedCode(8);
    }

    if (usedCodes) {
      // Ensure unique within same template
      while (usedCodes.has(code)) code = generateEmbedCode(8);
      usedCodes.add(code);
    }

    // Insert new redirect entry with unique code pointing to same destination
    await db.execute(sql`
      INSERT INTO affiliate_links (code, name, destination_url, user_id, is_active)
      VALUES (${code}, ${`auto:${sourceLink.name}`}, ${sourceLink.destinationUrl}, ${sourceLink.userId}, true)
      ON CONFLICT (code) DO NOTHING
    `);

    const domain = await getEmbedDomain();
    if (!domain) return sourceLink.destinationUrl;
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${cleanDomain}/r/${code}.mp4`;
  } catch {
    return "";
  }
}

/**
 * Create a new unique embed link for the same video source.
 * Each call generates a different code so multiple {link} in template get unique URLs.
 */
async function createUniqueEmbedLink(sourceUrl: string, title: string): Promise<string | null> {
  return createAutoEmbed(sourceUrl, title);
}

async function buildPostContent(job: typeof jobsTable.$inferSelect, media: typeof mediaTable.$inferSelect, link: string, userId?: number | null): Promise<string> {
  const tweetText = media.sourceText?.trim() ?? "";
  const tweetTextNoLinks = stripUrlsFromText(tweetText);

  // Extract OCR text from sourceText (stored as "[ocr] extracted text")
  const ocrMatch = tweetText.match(/\[ocr\]\s*(.+?)(?:\n|$)/);
  const caption = ocrMatch ? ocrMatch[1].trim() : "";

  let aiCaption: string | null = null;
  if (job.aiEnabled) {
    aiCaption = await generateAICaption(job, tweetText || null);
  }

  const template = job.postTemplate?.trim() || (aiCaption ? "{aiCaption}\n{link}" : "{tweetTextNoLinks}\n{link}");

  // Replace static variables first (ones that don't need unique generation)
  let result = template
    .replaceAll("{targetUsername}", media.targetUsername.replace(/^@+/, ""))
    .replaceAll("{originalUrl}", media.originalUrl)
    .replaceAll("{doodUrl}", media.doodUrl ?? link)
    .replaceAll("{streamtapeUrl}", media.streamtapeUrl ?? link)
    .replaceAll("{tweetText}", tweetText)
    .replaceAll("{tweetTextNoLinks}", tweetTextNoLinks)
    .replaceAll("{caption}", caption)
    .replaceAll("{aiCaption}", aiCaption ?? tweetTextNoLinks);

  // Replace {link} — each occurrence gets a unique embed code if autoEmbed is enabled
  const linkCount = (result.match(/\{link\}/g) || []).length;
  if (linkCount > 1 && job.autoEmbed) {
    // Multiple {link} — generate unique embed for each
    const videoSource = media.streamtapeUrl || media.doodUrl || media.originalUrl;
    for (let i = 0; i < linkCount; i++) {
      let uniqueLink = link;
      if (i > 0) {
        // Generate new embed code for 2nd, 3rd, etc.
        const newEmbed = await createUniqueEmbedLink(videoSource, `Auto: ${media.targetUsername} #${media.id}-${i + 1}`);
        if (newEmbed) uniqueLink = newEmbed;
      }
      result = result.replace("{link}", uniqueLink);
    }
  } else {
    result = result.replaceAll("{link}", link);
  }

  // Replace {affiliate} — each occurrence gets a different affiliate link
  const affiliateCount = (result.match(/\{affiliate\}/g) || []).length;
  if (affiliateCount > 0) {
    const usedCodes = new Set<string>();
    for (let i = 0; i < affiliateCount; i++) {
      const affiliateLink = await getRandomAffiliateLink(userId, usedCodes);
      result = result.replace("{affiliate}", affiliateLink);
    }
  }

  return result;
}

function getNextPrimeTime(primeTimeHours: string | null | undefined, offset: number): Date {
  const hours = (primeTimeHours ?? "8,12,18,21")
    .split(",")
    .map((h) => parseInt(h.trim(), 10))
    .filter((h) => !isNaN(h) && h >= 0 && h < 24)
    .sort((a, b) => a - b);

  if (hours.length === 0) return new Date(Date.now() + (offset + 1) * 60 * 60_000);

  const now = new Date();
  const candidates: Date[] = [];
  for (let day = 0; day <= 7; day++) {
    for (const hour of hours) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + day);
      candidate.setHours(hour, 0, 0, 0);
      if (candidate.getTime() > now.getTime()) candidates.push(candidate);
    }
  }
  return candidates[offset % Math.max(candidates.length, 1)] ?? new Date(Date.now() + (offset + 1) * 60 * 60_000);
}

function getScheduledAt(job: typeof jobsTable.$inferSelect, offset: number) {
  const now = new Date();
  if (job.scheduleType === "once") {
    const onceDate = new Date(job.scheduleValue);
    return Number.isNaN(onceDate.getTime()) ? now : onceDate;
  }

  if (job.repostEnabled && job.primeTimeHours) {
    return getNextPrimeTime(job.primeTimeHours, offset);
  }

  if (job.scheduleType === "interval") {
    const minutes = Math.max(1, Number.parseInt(job.scheduleValue, 10) || 60);
    return new Date(now.getTime() + offset * minutes * 60_000);
  }

  return new Date(now.getTime() + offset * 60 * 60_000);
}

function dbTimestampFromNow(msFromNow: number) {
  return new Date(Date.now() + msFromNow);
}

function getNextJobRun(job: typeof jobsTable.$inferSelect) {
  if (job.scheduleType === "once") return null;

  if (job.scheduleType === "interval") {
    const minutes = Math.max(1, Number.parseInt(job.scheduleValue, 10) || 60);
    return dbTimestampFromNow(minutes * 60_000);
  }

  return dbTimestampFromNow(60 * 60_000);
}

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

async function createAutoEmbed(doodUrl: string, title: string): Promise<string | null> {
  try {
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
  } catch {
    return null;
  }
}

async function resolveDoodApiKey(job: typeof jobsTable.$inferSelect): Promise<string | null> {
  const jobKey = job.doodApiKey?.trim();
  if (jobKey) return jobKey;
  const [settings] = await db.select({ doodstreamApiKey: settingsTable.doodstreamApiKey }).from(settingsTable).where(eq(settingsTable.id, 1));
  return settings?.doodstreamApiKey?.trim() || null;
}

async function prepareVideoForPost(job: typeof jobsTable.$inferSelect, media: typeof mediaTable.$inferSelect, account: typeof accountsTable.$inferSelect) {
  let linkForPost = job.insertLink?.trim() || media.originalUrl;
  let currentMedia = media;
  let uploaded = 0;
  let uploadFailed = 0;
  let skipped = false;

  // --- DoodStream upload + embed ---
  if (media.type === "video" && job.uploadToDood) {
    if (media.doodUrl && media.doodStatus === "done") {
      const baseDoodUrl = media.doodUrl;
      if (job.autoEmbed) {
        const embedUrl = await createAutoEmbed(baseDoodUrl, `Auto: ${media.targetUsername} #${media.id}`);
        linkForPost = job.insertLink?.trim() || embedUrl || baseDoodUrl;
      } else {
        linkForPost = job.insertLink?.trim() || baseDoodUrl;
      }
    } else {
      try {
        await db.update(mediaTable).set({ doodStatus: "uploading" }).where(eq(mediaTable.id, media.id));
        const doodApiKey = await resolveDoodApiKey(job);
        const { doodUrl } = await downloadAndUploadVideoToDood(doodApiKey, media.originalUrl);
        const [updatedMedia] = await db.update(mediaTable).set({
          doodStatus: "done",
          doodUrl,
        }).where(eq(mediaTable.id, media.id)).returning();
        currentMedia = updatedMedia ?? { ...media, doodStatus: "done", doodUrl };

        if (job.autoEmbed) {
          const embedUrl = await createAutoEmbed(doodUrl, `Auto: ${media.targetUsername} #${media.id}`);
          linkForPost = job.insertLink?.trim() || embedUrl || doodUrl;
        } else {
          linkForPost = job.insertLink?.trim() || doodUrl;
        }
        uploaded++;
      } catch (error) {
        uploadFailed++;
        await db.update(mediaTable).set({ doodStatus: "failed" }).where(eq(mediaTable.id, media.id));
        await db.insert(activityTable).values({
          type: "error",
          message: `DoodStream upload failed for media #${media.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
          jobId: job.id,
          accountUsername: account.username,
          targetUsername: media.targetUsername,
        });
        if (job.uploadToDood) skipped = true;
      }
    }
  }

  // --- Streamtape auto-embed (if video has streamtapeUrl and autoEmbed is enabled) ---
  // Only use Streamtape embed if DoodStream was not used or failed
  if (media.type === "video" && !job.uploadToDood && job.autoEmbed && media.streamtapeUrl) {
    const embedUrl = await createAutoEmbed(media.streamtapeUrl, `Auto: ${media.targetUsername} #${media.id}`);
    linkForPost = job.insertLink?.trim() || embedUrl || media.streamtapeUrl;
  }

  return { currentMedia, linkForPost, uploaded, uploadFailed, skipped };
}

async function processGrabbedMedia(job: typeof jobsTable.$inferSelect, mediaItems: Array<typeof mediaTable.$inferSelect>, account: typeof accountsTable.$inferSelect) {
  let uploaded = 0;
  let uploadFailed = 0;
  let postsQueued = 0;

  const groups = new Map<string, Array<typeof mediaTable.$inferSelect>>();
  for (const media of mediaItems) {
    const groupKey = media.sourceTweetId ?? `media:${media.id}`;
    const group = groups.get(groupKey) ?? [];
    group.push(media);
    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    const imageMedia = group.find((media) => media.type === "image");
    const videoMedia = group.find((media) => media.type === "video");
    const primaryMedia = videoMedia ?? imageMedia ?? group[0];

    if (!primaryMedia) continue;

    let contentMedia = primaryMedia;
    let linkForPost = job.insertLink?.trim() || primaryMedia.originalUrl;
    const attachmentMedia = imageMedia ?? primaryMedia;

    if (videoMedia) {
      const prepared = await prepareVideoForPost(job, videoMedia, account);
      uploaded += prepared.uploaded;
      uploadFailed += prepared.uploadFailed;
      if (prepared.skipped) continue;
      contentMedia = prepared.currentMedia;
      linkForPost = prepared.linkForPost;
    }

    if (job.postToX) {
      const content = await buildPostContent(job, contentMedia, linkForPost);
      await db.insert(postsTable).values({
        accountId: job.accountId,
        content,
        insertLink: linkForPost,
        mediaId: attachmentMedia.id,
        scheduledAt: getScheduledAt(job, postsQueued),
        status: "pending",
      });
      postsQueued++;

      if (job.repostEnabled && job.repostTargetAccountId && job.repostTargetAccountId !== job.accountId) {
        const repostContent = await buildPostContent(job, contentMedia, linkForPost);
        await db.insert(postsTable).values({
          accountId: job.repostTargetAccountId,
          content: repostContent,
          insertLink: linkForPost,
          mediaId: attachmentMedia.id,
          scheduledAt: getNextPrimeTime(job.primeTimeHours, postsQueued),
          status: "pending",
        });
        postsQueued++;
      }
    }
  }

  return { uploaded, uploadFailed, postsQueued };
}

async function fetchXJson<T>(url: string, bearerToken: string, proxyUrl?: string | null): Promise<XApiResponse<T>> {
  const response = await fetchWithProxy(url, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  }, proxyUrl);

  const payload = await response.json().catch(() => null) as XApiResponse<T> | null;

  if (!response.ok) {
    const detail = payload?.detail ?? payload?.errors?.[0]?.detail ?? payload?.title ?? `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return payload ?? {};
}

async function fetchXJsonWithFallback<T>(path: string, bearerToken: string, proxyUrl?: string | null) {
  try {
    return await fetchXJson<T>(`https://api.x.com${path}`, bearerToken, proxyUrl);
  } catch (error) {
    if (error instanceof Error && /401|403|Unauthorized|Forbidden|token/i.test(error.message)) {
      throw error;
    }
    return fetchXJson<T>(`https://api.twitter.com${path}`, bearerToken, proxyUrl);
  }
}

function pickProxyFromList(proxyList: string | null | undefined): string | null {
  if (!proxyList) return null;
  const proxies = proxyList.split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
  if (proxies.length === 0) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

async function fetchWithProxy(url: string | URL, options: RequestInit, proxyUrl?: string | null): Promise<Response> {
  if (!proxyUrl) return fetch(url, options);
  try {
    const { ProxyAgent, fetch: undiciFetch } = await import("undici");
    const dispatcher = new ProxyAgent(proxyUrl);
    return undiciFetch(url as string, { ...options, dispatcher } as Parameters<typeof undiciFetch>[1]) as unknown as Response;
  } catch {
    return fetch(url, options);
  }
}

async function fetchXJsonWithAccount<T>(path: string, account: typeof accountsTable.$inferSelect, proxyUrl?: string | null): Promise<XApiResponse<T>> {
  const urls = [`https://api.x.com${path}`, `https://api.twitter.com${path}`];
  let lastError = "Unable to fetch X timeline.";

  for (const fullUrl of urls) {
    const parsedUrl = new URL(fullUrl);
    const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
    const response = await fetchWithProxy(fullUrl, {
      headers: {
        Authorization: buildOAuthHeader(account, "GET", baseUrl, parsedUrl.searchParams),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20000),
    }, proxyUrl ?? account.proxyUrl);

    const payload = await response.json().catch(() => null) as XApiResponse<T> | null;
    if (response.ok) {
      return payload ?? {};
    }

    lastError = payload?.detail ?? payload?.errors?.[0]?.detail ?? payload?.title ?? `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) break;
  }

  throw new Error(lastError);
}

function collectCandidatesFromTweets(
  tweets: XApiTweet[],
  mediaItems: XApiMedia[],
  users: XApiUser[],
  existingUrls: Set<string>,
  job: typeof jobsTable.$inferSelect,
  fallbackUsername: string,
  shouldExtractTweetUrls: (tweet: XApiTweet) => boolean = () => true,
) {
  const notAllowedDomains = parseNotAllowedDomains(job.allowedVideoDomains);
  const mediaByKey = new Map(mediaItems.map((item) => [item.media_key, item]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const candidates: MediaCandidate[] = [];

  for (const tweet of tweets) {
    const tweetAuthorId = tweet.author_id;
    const targetUsername = usersById.get(tweetAuthorId ?? "")?.username ?? fallbackUsername;

    for (const mediaKey of tweet.attachments?.media_keys ?? []) {
      const media = mediaByKey.get(mediaKey);
      if (!media) continue;

      const mediaType = media.type === "photo" ? "image" : "video";
      if (mediaType === "image" && !job.grabImages) continue;
      if (mediaType === "video" && job.grabExternalLinksOnly) continue;
      if (mediaType === "video" && !job.grabVideos) continue;

      const originalUrl = media.url ?? media.preview_image_url;
      if (!originalUrl || existingUrls.has(originalUrl)) continue;

      candidates.push({
        type: mediaType,
        originalUrl,
        thumbnailUrl: mediaType === "video" ? (media.preview_image_url ?? null) : originalUrl,
        targetUsername,
        sourceTweetId: tweet.id,
        sourceText: tweet.text ?? null,
        doodStatus: mediaType === "video" && job.uploadToDood ? "pending" : null,
      });
      existingUrls.add(originalUrl);
    }

    // Extract external links from tweets only if explicitly enabled
    // By default (grabExternalLinksOnly = false), we DON'T extract external links
    // We only grab X native videos
    if (!job.grabExternalLinksOnly) continue;
    
    // If grabExternalLinksOnly is true, extract links from all tweets
    if (!job.grabVideos) continue;

    if (!keywordFilterMatches(tweet.text, job.keywordFilter)) continue;

    let insertedFromThisTweet = false;
    for (const url of extractTweetUrls(tweet)) {
      if (!isLikelyExternalVideoLink(url)) continue;
      if (isNotAllowedUrl(url, notAllowedDomains) || existingUrls.has(url)) continue;

      candidates.push({
        type: "video",
        originalUrl: url,
        thumbnailUrl: null,
        targetUsername,
        sourceTweetId: tweet.id,
        sourceText: tweet.text ?? null,
        doodStatus: job.uploadToDood ? "pending" : null,
      });
      existingUrls.add(url);
      insertedFromThisTweet = true;
    }

    // Only process the first tweet/reply/comment that contains video links.
    if (insertedFromThisTweet) break;
  }

  return candidates;
}

function filterByJobMediaPrefs(items: WebTimelineMedia[], existingUrls: Set<string>, job: typeof jobsTable.$inferSelect): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  
  // Parse keyword filter
  const keywords = job.keywordFilter
    ? job.keywordFilter.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    : [];
  
  for (const item of items) {
    if (item.type === "image" && !job.grabImages) continue;
    if (item.type === "video" && job.grabExternalLinksOnly) continue;
    if (item.type === "video" && !job.grabVideos) continue;
    if (existingUrls.has(item.originalUrl)) continue;
    
    // Filter by keyword if specified
    if (keywords.length > 0 && item.sourceText) {
      const textLower = item.sourceText.toLowerCase();
      const hasKeyword = keywords.some(keyword => textLower.includes(keyword));
      if (!hasKeyword) continue;
    }
    
    candidates.push({
      type: item.type,
      originalUrl: item.originalUrl,
      thumbnailUrl: item.thumbnailUrl,
      targetUsername: item.targetUsername,
      sourceTweetId: item.sourceTweetId,
      sourceText: item.sourceText,
      doodStatus: item.type === "video" && job.uploadToDood ? "pending" : null,
    });
    existingUrls.add(item.originalUrl);
  }
  return candidates;
}

async function scanTargetProfile(job: typeof jobsTable.$inferSelect, account: typeof accountsTable.$inferSelect, target: typeof targetsTable.$inferSelect, proxyUrl?: string | null): Promise<JobRunResult> {
  const username = target.xUsername.replace(/^@+/, "");

  let candidates: MediaCandidate[];
  const existingItems = await db.select({ originalUrl: mediaTable.originalUrl }).from(mediaTable).where(eq(mediaTable.jobId, job.id));
  const existingUrls = new Set<string>(existingItems.map((item: { originalUrl: string }) => item.originalUrl));

  if (account.authMode === "cookies") {
    const cookieAccount = { ...account, proxyUrl: proxyUrl ?? account.proxyUrl };
    const userInfo = await fetchUserIdByScreenName(cookieAccount, username);
    if (!userInfo) throw new Error(`Target @${username} was not found on X.`);
    const result = await fetchUserTweetsViaCookies(cookieAccount, userInfo.id, 20);
    candidates = filterByJobMediaPrefs(result.items, existingUrls, job);

    if ((job.grabExternalLinksOnly || job.extractLinksFromReplies) && job.grabVideos) {
      const notAllowedDomains = parseNotAllowedDomains(job.allowedVideoDomains);
      for (const tweet of result.tweets) {
        if (!keywordFilterMatches(tweet.text, job.keywordFilter)) continue;
        let insertedFromThisTweet = false;
        for (const url of tweet.urls) {
          if (!isLikelyExternalVideoLink(url)) continue;
          if (isNotAllowedUrl(url, notAllowedDomains)) continue;
          if (existingUrls.has(url)) continue;
          candidates.push({
            type: "video",
            originalUrl: url,
            thumbnailUrl: null,
            targetUsername: username,
            sourceTweetId: tweet.id,
            sourceText: tweet.text,
            doodStatus: job.uploadToDood ? "pending" : null,
          });
          existingUrls.add(url);
          insertedFromThisTweet = true;
        }
        if (insertedFromThisTweet) break;
      }
    }
  } else {
    const userResponse = await fetchXJsonWithFallback<{ id: string; username: string }>(`/2/users/by/username/${encodeURIComponent(username)}?user.fields=id,username`, account.bearerToken, proxyUrl);
    const userId = userResponse.data?.id;
    if (!userId) throw new Error(`Target @${username} was not found on X.`);

    const params = new URLSearchParams({
      max_results: "20",
      "tweet.fields": "entities,attachments,referenced_tweets,created_at",
      expansions: "attachments.media_keys",
      "media.fields": "type,url,preview_image_url",
    });
    params.set("exclude", job.includeReplies ? "retweets" : "retweets,replies");

    const timeline = await fetchXJsonWithFallback<XApiTweet[]>(`/2/users/${userId}/tweets?${params.toString()}`, account.bearerToken, proxyUrl);
    const tweets = timeline.data ?? [];
    candidates = collectCandidatesFromTweets(
      tweets,
      timeline.includes?.media ?? [],
      [],
      existingUrls,
      job,
      username,
      (tweet) => job.includeReplies && (tweet.referenced_tweets?.some((item) => item.type === "replied_to") ?? false),
    );
  }

  if (candidates.length === 0) {
    return { inserted: 0, uploaded: 0, uploadFailed: 0, postsQueued: 0 };
  }

  const insertedMedia = await db.insert(mediaTable).values(candidates.map((candidate) => ({
    jobId: job.id,
    targetUsername: candidate.targetUsername,
    type: candidate.type,
    originalUrl: candidate.originalUrl,
    thumbnailUrl: candidate.thumbnailUrl,
    sourceTweetId: candidate.sourceTweetId,
    sourceText: candidate.sourceText,
    doodStatus: candidate.doodStatus,
  }))).returning();

  const pipelineResult = await processGrabbedMedia(job, insertedMedia, account);

  await db.update(targetsTable).set({
    mediaCount: (target.mediaCount ?? 0) + candidates.length,
    lastChecked: new Date(),
  }).where(eq(targetsTable.id, target.id));

  return { inserted: candidates.length, ...pipelineResult };
}

async function scanHomeTimeline(job: typeof jobsTable.$inferSelect, account: typeof accountsTable.$inferSelect, proxyUrl?: string | null): Promise<JobRunResult> {
  const username = account.username.replace(/^@+/, "");
  const existingItems = await db.select({ originalUrl: mediaTable.originalUrl }).from(mediaTable).where(eq(mediaTable.jobId, job.id));
  const existingUrls = new Set<string>(existingItems.map((item: { originalUrl: string }) => item.originalUrl));

  let candidates: MediaCandidate[];

  if (account.authMode === "cookies") {
    const cookieAccount = { ...account, proxyUrl: proxyUrl ?? account.proxyUrl };
    const result = await fetchHomeTimelineViaCookies(cookieAccount, 20);
    candidates = filterByJobMediaPrefs(result.items, existingUrls, job);

    if (job.grabExternalLinksOnly && job.grabVideos) {
      const notAllowedDomains = parseNotAllowedDomains(job.allowedVideoDomains);
      for (const tweet of result.tweets) {
        if (!keywordFilterMatches(tweet.text, job.keywordFilter)) continue;
        let insertedFromThisTweet = false;
        for (const url of tweet.urls) {
          if (!isLikelyExternalVideoLink(url)) continue;
          if (isNotAllowedUrl(url, notAllowedDomains) || existingUrls.has(url)) continue;
          candidates.push({
            type: "video",
            originalUrl: url,
            thumbnailUrl: null,
            targetUsername: tweet.username || username,
            sourceTweetId: tweet.id,
            sourceText: tweet.text,
            doodStatus: job.uploadToDood ? "pending" : null,
          });
          existingUrls.add(url);
          insertedFromThisTweet = true;
        }
        if (insertedFromThisTweet) break;
      }
    }
  } else {
    const userResponse = await fetchXJsonWithFallback<{ id: string; username: string }>(`/2/users/by/username/${encodeURIComponent(username)}?user.fields=id,username`, account.bearerToken, proxyUrl);
    const userId = userResponse.data?.id;
    if (!userId) throw new Error(`Account @${username} was not found on X.`);

    const params = new URLSearchParams({
      max_results: "20",
      "tweet.fields": "entities,attachments,referenced_tweets,created_at,author_id",
      expansions: "attachments.media_keys,author_id",
      "media.fields": "type,url,preview_image_url",
      "user.fields": "username",
    });

    const timeline = await fetchXJsonWithAccount<XApiTweet[]>(`/2/users/${userId}/timelines/reverse_chronological?${params.toString()}`, account, proxyUrl);
    candidates = collectCandidatesFromTweets(timeline.data ?? [], timeline.includes?.media ?? [], timeline.includes?.users ?? [], existingUrls, job, username);
  }

  if (candidates.length === 0) {
    return { inserted: 0, uploaded: 0, uploadFailed: 0, postsQueued: 0 };
  }

  const insertedMedia = await db.insert(mediaTable).values(candidates.map((candidate) => ({
    jobId: job.id,
    targetUsername: candidate.targetUsername,
    type: candidate.type,
    originalUrl: candidate.originalUrl,
    thumbnailUrl: candidate.thumbnailUrl,
    sourceTweetId: candidate.sourceTweetId,
    sourceText: candidate.sourceText,
    doodStatus: candidate.doodStatus,
  }))).returning();

  const pipelineResult = await processGrabbedMedia(job, insertedMedia, account);
  return { inserted: candidates.length, ...pipelineResult };
}

async function useSavedMedia(job: typeof jobsTable.$inferSelect, account: typeof accountsTable.$inferSelect): Promise<JobRunResult> {
  const rows = job.savedMediaId
    ? await db.select().from(mediaTable).where(eq(mediaTable.id, job.savedMediaId)).limit(1)
    : await db.select().from(mediaTable)
      .where(sql`(${mediaTable.type} = 'image' OR (${mediaTable.type} = 'video' AND ${mediaTable.thumbnailUrl} IS NOT NULL AND ${mediaTable.thumbnailUrl} <> ''))`)
      .orderBy(sql`random()`)
      .limit(1);
  const [media] = rows;

  if (!media) {
    throw new Error(job.savedMediaId ? `Saved media #${job.savedMediaId} was not found.` : "No saved media available in library.");
  }

  const result = await processGrabbedMedia(job, [media], account);
  return { inserted: 0, ...result };
}

async function scanSearchKeyword(job: typeof jobsTable.$inferSelect, account: typeof accountsTable.$inferSelect, proxyUrl?: string | null): Promise<JobRunResult> {
  const keyword = job.keywordFilter?.trim();
  if (!keyword) throw new Error("Search keyword is required for Search X source mode.");

  if (account.authMode !== "cookies") throw new Error("Search X requires cookie auth account.");

  const existingItems = await db.select({ originalUrl: mediaTable.originalUrl }).from(mediaTable).where(eq(mediaTable.jobId, job.id));
  const existingUrls = new Set<string>(existingItems.map((item: { originalUrl: string }) => item.originalUrl));

  const cookieAccount = { ...account, proxyUrl: proxyUrl ?? account.proxyUrl };
  const tweets = await searchTweetsViaCookies(cookieAccount, keyword, 20);

  const notAllowedDomains = parseNotAllowedDomains(job.allowedVideoDomains);
  const directMp4Only = shouldGrabDirectMp4Only(job.keywordFilter);
  const candidates: MediaCandidate[] = [];

  for (const tweet of tweets) {
    if (!tweet.id) continue;
    if (tweet.username.toLowerCase() === account.username.toLowerCase()) continue;

    if (job.grabExternalLinksOnly && job.grabVideos) {
      if (!keywordFilterMatches(tweet.text, null)) continue; // keyword already used as search query
      for (const url of Array.from(new Set([...(tweet.urls ?? []), ...extractTextUrls(tweet.text ?? "")]))) {
        if (!isLikelyExternalVideoLink(url)) continue;
        // If keyword is exactly "mp4", grab only direct .mp4 links like cdn1.twimg.guru/xxx.mp4
        // and skip generic shortlinks such as t.co/youtube/etc.
        if (directMp4Only && !isDirectMp4Url(url)) continue;
        if (isNotAllowedUrl(url, notAllowedDomains) || existingUrls.has(url)) continue;
        candidates.push({
          type: "video",
          originalUrl: url,
          thumbnailUrl: null,
          targetUsername: tweet.username,
          sourceTweetId: tweet.id,
          sourceText: tweet.text,
          doodStatus: job.uploadToDood ? "pending" : null,
        });
        existingUrls.add(url);
      }
    } else {
      // Treat tweet page URL as external source to grab for post
      const tweetUrl = `https://x.com/${tweet.username}/status/${tweet.id}`;
      if (existingUrls.has(tweetUrl)) continue;
      if (!keywordFilterMatches(tweet.text, null)) continue;
      candidates.push({
        type: "video",
        originalUrl: tweetUrl,
        thumbnailUrl: null,
        targetUsername: tweet.username,
        sourceTweetId: tweet.id,
        sourceText: tweet.text,
        doodStatus: null,
      });
      existingUrls.add(tweetUrl);
    }
  }

  if (candidates.length === 0) return { inserted: 0, uploaded: 0, uploadFailed: 0, postsQueued: 0 };

  const insertedMedia = await db.insert(mediaTable).values(candidates.map((c) => ({
    jobId: job.id,
    targetUsername: c.targetUsername,
    type: c.type,
    originalUrl: c.originalUrl,
    thumbnailUrl: c.thumbnailUrl,
    sourceTweetId: c.sourceTweetId,
    sourceText: c.sourceText,
    doodStatus: c.doodStatus,
  }))).returning();

  const pipelineResult = await processGrabbedMedia(job, insertedMedia, account);
  return { inserted: candidates.length, ...pipelineResult };
}

export async function runJobById(id: number) {
  const [current] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!current) {
    throw new Error("Job not found");
  }

  await db.update(jobsTable).set({
    status: "running",
    lastRun: dbTimestampFromNow(0),
    runsCount: (current.runsCount || 0) + 1,
  }).where(eq(jobsTable.id, id));

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, current.accountId));
  const [target] = current.targetId
    ? await db.select().from(targetsTable).where(eq(targetsTable.id, current.targetId))
    : [null];

  if (!account || (current.mediaSource === "grab" && !target)) {
    await db.update(jobsTable).set({ status: "error" }).where(eq(jobsTable.id, id));
    throw new Error(current.mediaSource === "grab" ? "Job account or target not found" : "Job account not found");
  }

  const jobProxy = pickProxyFromList(current.proxyList);

  try {
    const result = current.mediaSource === "library"
      ? await useSavedMedia(current, account)
      : current.mediaSource === "home"
      ? await scanHomeTimeline(current, account, jobProxy)
      : current.mediaSource === "search"
      ? await scanSearchKeyword(current, account, jobProxy)
      : await scanTargetProfile(current, account, target!, jobProxy);
    await db.insert(activityTable).values({
      type: "job_run",
      message: current.mediaSource === "library"
        ? `Job "${current.name}" used saved media #${current.savedMediaId}, uploaded ${result.uploaded} to DoodStream, queued ${result.postsQueued} post(s)`
        : current.mediaSource === "home"
        ? `Job "${current.name}" grabbed ${result.inserted} media item(s) from @${account.username}'s home timeline, uploaded ${result.uploaded} to DoodStream, queued ${result.postsQueued} post(s)`
        : current.mediaSource === "search"
        ? `Job "${current.name}" grabbed ${result.inserted} media item(s) from search "${current.keywordFilter}", uploaded ${result.uploaded} to DoodStream, queued ${result.postsQueued} post(s)`
        : current.includeReplies && current.extractLinksFromReplies
        ? `Job "${current.name}" grabbed ${result.inserted} media item(s), uploaded ${result.uploaded} to DoodStream, queued ${result.postsQueued} post(s), including reply video links when found`
        : `Job "${current.name}" grabbed ${result.inserted} media item(s), uploaded ${result.uploaded} to DoodStream, queued ${result.postsQueued} post(s)`,
      jobId: id,
      accountUsername: account.username,
      targetUsername: target?.xUsername ?? account.username,
    });

    const [latestJobState] = await db.select({ isActive: jobsTable.isActive }).from(jobsTable).where(eq(jobsTable.id, id));
    const shouldRemainActive = current.scheduleType === "once" ? false : (latestJobState?.isActive ?? current.isActive);
    const nextRun = shouldRemainActive ? getNextJobRun(current) : null;
    await db.update(jobsTable).set({
      status: "idle",
      nextRun,
      isActive: shouldRemainActive,
    }).where(eq(jobsTable.id, id));

    return result;
  } catch (error) {
    await db.update(jobsTable).set({
      status: "error",
      nextRun: getNextJobRun(current),
    }).where(eq(jobsTable.id, id));
    await db.insert(activityTable).values({
      type: "error",
      message: error instanceof Error ? error.message : "Job run failed",
      jobId: id,
      accountUsername: account.username,
      targetUsername: target?.xUsername ?? account.username,
    });
    throw error;
  }
}

router.get("/", async (_req, res) => {
  const jobs = await db.select({
    id: jobsTable.id,
    name: jobsTable.name,
    accountId: jobsTable.accountId,
    targetId: jobsTable.targetId,
    accountUsername: accountsTable.username,
    targetUsername: targetsTable.xUsername,
    mediaSource: jobsTable.mediaSource,
    savedMediaId: jobsTable.savedMediaId,
    scheduleType: jobsTable.scheduleType,
    scheduleValue: jobsTable.scheduleValue,
    grabImages: jobsTable.grabImages,
    grabVideos: jobsTable.grabVideos,
    includeReplies: jobsTable.includeReplies,
    extractLinksFromReplies: jobsTable.extractLinksFromReplies,
    allowedVideoDomains: jobsTable.allowedVideoDomains,
    keywordFilter: jobsTable.keywordFilter,
    grabExternalLinksOnly: jobsTable.grabExternalLinksOnly,
    uploadToDood: jobsTable.uploadToDood,
    autoEmbed: jobsTable.autoEmbed,
    doodApiKey: jobsTable.doodApiKey,
    postToX: jobsTable.postToX,
    postTemplate: jobsTable.postTemplate,
    insertLink: jobsTable.insertLink,
    isActive: jobsTable.isActive,
    lastRun: jobsTable.lastRun,
    nextRun: jobsTable.nextRun,
    runsCount: jobsTable.runsCount,
    status: jobsTable.status,
    createdAt: jobsTable.createdAt,
    proxyList: jobsTable.proxyList,
    aiEnabled: jobsTable.aiEnabled,
    aiProvider: jobsTable.aiProvider,
    aiApiKey: jobsTable.aiApiKey,
    aiPrompt: jobsTable.aiPrompt,
    repostEnabled: jobsTable.repostEnabled,
    primeTimeHours: jobsTable.primeTimeHours,
    repostTargetAccountId: jobsTable.repostTargetAccountId,
    watermarkEnabled: jobsTable.watermarkEnabled,
    watermarkType: jobsTable.watermarkType,
    watermarkText: jobsTable.watermarkText,
    watermarkFontSize: jobsTable.watermarkFontSize,
    watermarkFontWeight: jobsTable.watermarkFontWeight,
    watermarkColor: jobsTable.watermarkColor,
    watermarkOpacity: jobsTable.watermarkOpacity,
    watermarkPosition: jobsTable.watermarkPosition,
    watermarkLogoUrl: jobsTable.watermarkLogoUrl,
  })
    .from(jobsTable)
    .leftJoin(accountsTable, eq(jobsTable.accountId, accountsTable.id))
    .leftJoin(targetsTable, eq(jobsTable.targetId, targetsTable.id))
    .orderBy(jobsTable.createdAt);
  res.json(jobs);
});

router.post("/", jobCreationLimiter, async (req, res) => {
  const body = CreateJobBody.parse(req.body);
  const [job] = await db.insert(jobsTable).values({
    ...body,
    runsCount: 0,
    status: "idle",
  }).returning();
  const full = await getJobWithNames(job.id);
  jobLogger.created(job.id, body.accountId, body.targetId ?? 0);
  res.status(201).json(full);
});

router.get("/:id", async (req, res) => {
  const { id } = GetJobParams.parse({ id: Number(req.params.id) });
  const job = await getJobWithNames(id);
  if (!job) return res.status(404).json({ error: "Not found" });
  res.json(job);
});

router.put("/:id", jobActionLimiter, async (req, res) => {
  const { id } = UpdateJobParams.parse({ id: Number(req.params.id) });
  const parsed = CreateJobBody.partial().parse(req.body ?? {});
  const body = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));

  if (Object.keys(body).length > 0) {
    await db.update(jobsTable).set(body).where(eq(jobsTable.id, id));

    // Recalculate next_run if schedule changed and job is active
    if ((body.scheduleType || body.scheduleValue) && body.isActive !== false) {
      const [updated] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
      if (updated && updated.isActive) {
        const nextRun = getNextJobRun(updated);
        await db.update(jobsTable).set({ nextRun }).where(eq(jobsTable.id, id));
      }
    }
  }

  const job = await getJobWithNames(id);
  if (!job) return res.status(404).json({ error: "Not found" });
  res.json(job);
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteJobParams.parse({ id: Number(req.params.id) });
  try {
    // Delete related media first
    await db.delete(mediaTable).where(eq(mediaTable.jobId, id));
    // Then delete the job
    await db.delete(jobsTable).where(eq(jobsTable.id, id));
    res.json({ ok: true });
  } catch (error) {
    logger.error({ error, jobId: id }, "Failed to delete job");
    res.status(500).json({ error: "Failed to delete job" });
  }
});

router.post("/:id/toggle", async (req, res) => {
  const { id } = ToggleJobParams.parse({ id: Number(req.params.id) });
  const [current] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!current) return res.status(404).json({ error: "Not found" });
  
  const newActiveState = !current.isActive;
  const updates: Partial<typeof jobsTable.$inferInsert> = { isActive: newActiveState };
  
  // When toggling ON, only recalculate next_run if it's in the past or null
  if (newActiveState && current.scheduleType !== "once") {
    const now = new Date();
    const currentNextRun = current.nextRun ? new Date(current.nextRun) : null;
    
    // Only recalculate if next_run is null or already passed
    if (!currentNextRun || currentNextRun <= now) {
      const nextRun = getNextJobRun(current);
      updates.nextRun = nextRun;
    }
    // Otherwise keep the existing next_run (resume from where it was paused)
  }
  
  await db.update(jobsTable).set(updates).where(eq(jobsTable.id, id));
  const job = await getJobWithNames(id);
  res.json(job);
});

router.post("/:id/run", jobActionLimiter, async (req, res) => {
  const { id } = RunJobNowParams.parse({ id: Number(req.params.id) });
  try {
    await runJobById(id);
    const job = await getJobWithNames(id);
    if (!job) return res.status(404).json({ error: "Not found" });
    res.json(job);
  } catch (error) {
    const status = error instanceof Error && error.message === "Job not found" ? 404 : 400;
    res.status(status).json({ error: error instanceof Error ? error.message : "Job run failed" });
  }
});

export default router;
