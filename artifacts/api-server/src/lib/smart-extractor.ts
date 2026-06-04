import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const execAsync = promisify(exec);

export const VIDEO_EXTENSIONS = ["mp4", "m3u8", "webm", "mkv", "avi", "mov", "flv", "ts", "wmv"];

let _cachedYtdlpPath: string | null | undefined = undefined;

function findInNixStore(): string | null {
  try {
    const nixStore = "/nix/store";
    if (!fs.existsSync(nixStore)) return null;
    const entries = fs.readdirSync(nixStore);
    for (const entry of entries) {
      if (entry.includes("yt-dlp")) {
        const candidate = path.join(nixStore, entry, "bin", "yt-dlp");
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch {}
  return null;
}

export async function resolveYtdlpPath(): Promise<string | null> {
  if (_cachedYtdlpPath !== undefined) return _cachedYtdlpPath;

  // Try project root .bin/yt-dlp (go up from artifacts/api-server/dist)
  const projectBin = path.resolve(process.cwd(), ".bin/yt-dlp");
  const projectBinAlt = path.resolve(process.cwd(), "../../.bin/yt-dlp");
  
  if (fs.existsSync(projectBin)) {
    _cachedYtdlpPath = projectBin;
    return projectBin;
  }
  
  if (fs.existsSync(projectBinAlt)) {
    _cachedYtdlpPath = projectBinAlt;
    return projectBinAlt;
  }

  const candidates = [
    ...(process.env.PATH || "").split(":").map((dir) => path.join(dir, "yt-dlp")),
    "/home/runner/.nix-profile/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        _cachedYtdlpPath = candidate;
        return candidate;
      }
    } catch {}
  }

  const nixPath = findInNixStore();
  if (nixPath) {
    _cachedYtdlpPath = nixPath;
    return nixPath;
  }

  _cachedYtdlpPath = null;
  return null;
}

export const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
};

export const UA_LIST = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
];

const MARKETPLACE_AD_DOMAINS = [
  "shopee.co.id",
  "shopee.com",
  "shopee.sg",
  "shopee.my",
  "shopee.ph",
  "shopee.vn",
  "shopee.co.th",
  "tokopedia.com",
  "vdap.fun",
  "vdfq.de",
  "vqab.de",
];

let blockedDomainsCache: { domains: string[]; expiresAt: number } | null = null;

export async function getBlockedDomains(): Promise<string[]> {
  const now = Date.now();
  if (blockedDomainsCache && blockedDomainsCache.expiresAt > now) {
    return blockedDomainsCache.domains;
  }

  try {
    const { db } = await import("@workspace/db");
    const { settingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    const custom = settings?.blockedDomains?.split(/[\n,]+/).map((d) => d.trim().toLowerCase()).filter(Boolean) ?? [];
    const domains = Array.from(new Set([...MARKETPLACE_AD_DOMAINS, ...custom]));
    blockedDomainsCache = { domains, expiresAt: now + 60_000 };
    return domains;
  } catch {
    return MARKETPLACE_AD_DOMAINS;
  }
}

export async function isMarketplaceAdUrl(url: string): Promise<boolean> {
  try {
    const blockedDomains = await getBlockedDomains();
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return blockedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function fetchHtmlWithUaFallback(url: string, referer: string): Promise<{ html: string; finalUrl: string } | null> {
  for (const ua of UA_LIST) {
    try {
      const resp = await fetch(url, {
        redirect: "follow",
        headers: {
          ...BROWSER_HEADERS,
          "User-Agent": ua,
          "Referer": referer,
        },
      });
      const ct = resp.headers.get("content-type") || "";
      if (!ct.includes("html")) continue;
      if (!resp.ok) continue;
      const html = await resp.text();
      if (html.trim().length < 100) continue;
      return { html, finalUrl: resp.url || url };
    } catch {}
  }
  return null;
}

export function getHtmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1] || null;
}

export function decodeHtmlValue(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function getUrlExt(url: string): string {
  try {
    const lastSegment = new URL(url).pathname.split("/").pop() || "";
    return lastSegment.includes(".") ? lastSegment.split(".").pop()?.toLowerCase() || "mp4" : "mp4";
  } catch {
    return "mp4";
  }
}

function isVideoContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith("video/") ||
    normalized.includes("application/vnd.apple.mpegurl") ||
    normalized.includes("application/x-mpegurl") ||
    normalized.includes("audio/mpegurl")
  );
}

function isPossiblyBinaryVideo(contentType: string, status: number, contentLength: string | null, acceptRanges: string | null): boolean {
  const normalized = contentType.toLowerCase();
  if (!normalized.includes("application/octet-stream") && !normalized.includes("binary/octet-stream")) return false;
  const size = contentLength ? Number(contentLength) : 0;
  return status === 206 || acceptRanges?.toLowerCase().includes("bytes") || size > 100_000;
}

export async function validateDirectVideoUrl(url: string, referer?: string): Promise<boolean> {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase() || "";
    if (!VIDEO_EXTENSIONS.includes(ext)) return false;
  } catch {
    return false;
  }

  const headers = {
    ...BROWSER_HEADERS,
    ...(referer ? { Referer: referer } : {}),
  };

  for (const method of ["HEAD", "GET"] as const) {
    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        headers: {
          ...headers,
          ...(method === "GET" ? { Range: "bytes=0-0" } : {}),
        },
      });

      if (!response.ok && response.status !== 206) continue;

      const contentType = response.headers.get("content-type") || "";
      const contentLength = response.headers.get("content-length");
      const acceptRanges = response.headers.get("accept-ranges");

      if (isVideoContentType(contentType)) return true;
      if (isPossiblyBinaryVideo(contentType, response.status, contentLength, acceptRanges)) return true;
      if (contentType.toLowerCase().includes("text/html") || contentType.toLowerCase().startsWith("image/")) return false;
    } catch {}
  }

  return false;
}

export function extractVideoUrls(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const base = new URL(baseUrl);

  for (const source of html.matchAll(/<source\b[^>]*>/gi)) {
    const tag = source[0];
    const src = getHtmlAttr(tag, "src");
    const type = getHtmlAttr(tag, "type") || "";
    if (!src || !type.toLowerCase().startsWith("video/")) continue;
    try {
      found.add(new URL(decodeHtmlValue(src), base).href);
    } catch {}
  }

  const patterns = [
    /["'](https?:\/\/[^"'\s<>]{10,800}\.(?:mp4|m3u8|webm|mkv|avi|mov|flv|ts|wmv)(?:[?#][^"'\s<>]*)?)["']/gi,
    /src\s*[=:]\s*["'](https?:\/\/[^"'\s<>]{10,800})["']/gi,
    /file\s*[=:]\s*["'](https?:\/\/[^"'\s<>]{10,800})["']/gi,
    /url\s*[=:]\s*["'](https?:\/\/[^"'\s<>]{10,800}\.(?:mp4|m3u8|webm|mkv|flv|ts)(?:[?#][^"'\s<>]*)?)["']/gi,
    /source\s*[=:]\s*["'](https?:\/\/[^"'\s<>]{10,800})["']/gi,
    /videoUrl\s*[=:]\s*["'](https?:\/\/[^"'\s<>]{10,800})["']/gi,
    /video_url\s*[=:]\s*["'](https?:\/\/[^"'\s<>]{10,800})["']/gi,
    /hls\s*[=:]\s*["'](https?:\/\/[^"'\s<>]{10,800})["']/gi,
    /hlsUrl\s*[=:]\s*["'](https?:\/\/[^"'\s<>]{10,800})["']/gi,
    /["'](https?:\/\/[^"'\s<>]{10,800}\/(?:hls|video|media|stream|content|files?|uploads?|cdn)[^"'\s<>]{0,400})["']/gi,
    /<source[^>]+src=["']([^"']+)["']/gi,
    /<video[^>]+src=["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(html)) !== null) {
      let candidate = match[1];
      if (!candidate) continue;
      try {
        const resolved = new URL(candidate, base).href;
        const ext = resolved.split("?")[0].split(".").pop()?.toLowerCase() || "";
        if (VIDEO_EXTENSIONS.includes(ext)) {
          found.add(resolved);
        } else if (
          resolved.includes("/hls/") ||
          resolved.includes("/stream") ||
          resolved.includes("/video") ||
          resolved.includes("/media") ||
          resolved.includes(".m3u8") ||
          resolved.includes("manifest")
        ) {
          found.add(resolved);
        }
      } catch {
      }
    }
  }

  // Detect JS concatenation patterns like: video.src = "https://cdn.example.com/" + vid + ".mp4"
  // where `vid` is derived from the page URL pathname
  const concatPatterns = [
    /(?:video|player|source|el)(?:\.\w+)*\.src\s*=\s*["'](https?:\/\/[^"']+)["']\s*\+\s*(\w+)\s*\+\s*["'](\.\w+)["']/gi,
    /(?:video|player|source|el)(?:\.\w+)*\.src\s*=\s*["'](https?:\/\/[^"']+)["']\s*\+\s*(\w+)/gi,
  ];

  for (const pattern of concatPatterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(html)) !== null) {
      const baseUrlPart = match[1];
      const varName = match[2];
      const suffix = match[3] || "";

      // Try to resolve the variable value from common patterns:
      // 1. let/var/const vid = window.location.pathname.split('/').pop()
      // 2. let/var/const vid = "literal"
      let varValue: string | null = null;

      // Check if variable is derived from pathname
      const pathPattern = new RegExp(`(?:let|var|const)\\s+${varName}\\s*=\\s*window\\.location\\.pathname\\.split\\(['"/].*?['"/]\\)\\.pop\\(\\)`, "i");
      if (pathPattern.test(html)) {
        try {
          const pathname = new URL(baseUrl).pathname;
          varValue = pathname.split("/").pop()?.replace(/\.\w+$/, "") || null;
        } catch {}
      }

      // Check if variable is a literal string
      if (!varValue) {
        const literalPattern = new RegExp(`(?:let|var|const)\\s+${varName}\\s*=\\s*["']([^"']+)["']`);
        const literalMatch = html.match(literalPattern);
        if (literalMatch) varValue = literalMatch[1];
      }

      if (varValue) {
        const resolvedUrl = baseUrlPart + varValue + suffix;
        try {
          const ext = resolvedUrl.split("?")[0].split(".").pop()?.toLowerCase() || "";
          if (VIDEO_EXTENSIONS.includes(ext)) {
            found.add(resolvedUrl);
          }
        } catch {}
      }
    }
  }

  return Array.from(found).slice(0, 20);
}

export function extractAutoSubmitForm(html: string, baseUrl: string): { url: string; method: string; body?: URLSearchParams } | null {
  if (!/\.submit\s*\(\s*\)/i.test(html)) return null;
  const formTag = html.match(/<form\b[^>]*>/i)?.[0];
  if (!formTag) return null;

  const action = getHtmlAttr(formTag, "action");
  if (!action) return null;

  const method = (getHtmlAttr(formTag, "method") || "GET").toUpperCase();
  const targetUrl = new URL(decodeHtmlValue(action), baseUrl).href;
  const params = new URLSearchParams();
  const inputs = html.matchAll(/<input\b[^>]*>/gi);

  for (const input of inputs) {
    const tag = input[0];
    const name = getHtmlAttr(tag, "name");
    if (!name) continue;
    params.set(decodeHtmlValue(name), decodeHtmlValue(getHtmlAttr(tag, "value") || ""));
  }

  if (method === "GET") {
    const next = new URL(targetUrl);
    params.forEach((value, key) => next.searchParams.set(key, value));
    return { url: next.href, method };
  }

  return { url: targetUrl, method, body: params };
}

export function extractNestedPageUrls(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /<iframe[^>]+src=["']([^"']+)["']/gi,
    /\b(?:playerPath|fullURL)\s*=\s*["']([^"']+)["']/gi,
    /\b(?:playerPath|fullURL)\s*:\s*["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(html)) !== null) {
      try {
        found.add(new URL(decodeHtmlValue(match[1]), baseUrl).href);
      } catch {}
    }
  }

  const iframeId = html.match(/\biframeId\s*=\s*["']([^"']+)["']/i)?.[1];
  const iframePath = html.match(/iframe\.src\s*=\s*["']([^"']+\?id=)["']\s*\+\s*iframeId/i)?.[1];
  if (iframeId && iframePath) {
    try {
      found.add(new URL(`${decodeHtmlValue(iframePath)}${decodeHtmlValue(iframeId)}`, baseUrl).href);
    } catch {}
  }

  const jsVarMatches = [...html.matchAll(/\bvar\s+(\w+)\s*=\s*["']([^"']{4,200})["']/gi)];
  const jsVars: Record<string, string> = {};
  for (const m of jsVarMatches) jsVars[m[1]] = m[2];

  const iframeSrcMatches = [...html.matchAll(/(?:iframe|player)\s*\.src\s*=\s*["']([^"']+)["']\s*\+\s*(\w+)/gi)];
  for (const m of iframeSrcMatches) {
    const basePart = m[1];
    const varName = m[2];
    const varValue = jsVars[varName];
    if (varValue) {
      try { found.add(new URL(`${decodeHtmlValue(basePart)}${decodeHtmlValue(varValue)}`, baseUrl).href); } catch {}
    }
  }

  const iframeSrcLiteralMatches = [...html.matchAll(/(?:iframe|player)\s*\.src\s*=\s*["']([^"']{6,300})["']/gi)];
  for (const m of iframeSrcLiteralMatches) {
    try { found.add(new URL(decodeHtmlValue(m[1]), baseUrl).href); } catch {}
  }

  return Array.from(found).slice(0, 15);
}

export function extractTitle(html: string): string | null {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  return title || null;
}

export function extractThumbnail(html: string, baseUrl: string): string | null {
  const candidate =
    html.match(/\bposter\s*=\s*["']([^"']+)["']/i)?.[1] ||
    html.match(/<img[^>]+class=["'][^"']*thumbnail[^"']*["'][^>]+src=["']([^"']+)["']/i)?.[1] ||
    null;
  if (!candidate) return null;
  try {
    return new URL(decodeHtmlValue(candidate), baseUrl).href;
  } catch {
    return null;
  }
}

function uuidv4(): string {
  return crypto.randomUUID();
}

function boodstreamSign(reqId: string): string {
  const key = Buffer.from("kP9rT2vN8mJ1bZ6c");
  const iv = Buffer.from("d7e8f9a0b1c2d3e4");
  const plaintext = `t:WF;kZKMcXwKqE${reqId}`;
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]).toString("base64");
}

export async function tryBoodstream(url: string): Promise<{ videoUrl: string; title: string | null } | null> {
  try {
    const parsed = new URL(url);
    const isBoodstream =
      parsed.hostname.includes("boodstream.cc") ||
      parsed.hostname.includes("boodstream.com");
    if (!isBoodstream) return null;

    const videoId = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    if (!videoId || videoId.length < 3) return null;

    const reqId = uuidv4();
    const timestamp = Date.now();
    const sign = boodstreamSign(reqId);

    const apiUrl = `https://apbood.boodstream.com/v1/file/getVideo?videoId=${encodeURIComponent(videoId)}`;
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "a-time": String(timestamp),
        "a-req-id": reqId,
        "user-client": "web",
        "country-no": "en_US",
        "a-sign": sign,
        "Origin": "https://share.boodstream.cc",
        "Referer": url,
        "User-Agent": BROWSER_HEADERS["User-Agent"],
      },
    });

    if (!response.ok) return null;

    const data = await response.json() as { code: number; data?: { videoUrl?: string; title?: string; fileTitle?: string } | null };
    if (data.code !== 0 || !data.data?.videoUrl) return null;

    return {
      videoUrl: data.data.videoUrl,
      title: data.data.title || data.data.fileTitle || null,
    };
  } catch {
    return null;
  }
}

export async function resolveJsRedirectChain(startUrl: string, maxHops = 5): Promise<string[]> {
  const visited = new Set<string>();
  const chain: string[] = [startUrl];
  let current = startUrl;
  let method = "GET";
  let body: URLSearchParams | undefined;

  for (let i = 0; i < maxHops; i++) {
    const visitKey = `${method}:${current}:${body?.toString() || ""}`;
    if (visited.has(visitKey)) break;
    visited.add(visitKey);

    try {
      const referer = chain.length > 1 ? chain[chain.length - 2] : startUrl;
      let resp: Response | null = null;

      for (const ua of (method === "GET" ? UA_LIST : [BROWSER_HEADERS["User-Agent"]])) {
        try {
          const r = await fetch(current, {
            method,
            body: method === "POST" ? body : undefined,
            redirect: "follow",
            headers: {
              ...BROWSER_HEADERS,
              "User-Agent": ua,
              ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
              "Referer": referer,
            },
          });
          if (r.ok || r.status === 301 || r.status === 302) { resp = r; break; }
          if (!resp) resp = r;
        } catch {}
      }
      if (!resp) break;

      const ct = resp.headers.get("content-type") || "";
      const responseUrl = resp.url || current;

      if (responseUrl !== current && !chain.includes(responseUrl)) {
        chain.push(responseUrl);
        current = responseUrl;
        method = "GET";
        body = undefined;
      }

      if (!ct.includes("html")) break;

      const html = await resp.text();

      const formRedirect = extractAutoSubmitForm(html, current);
      if (formRedirect && formRedirect.url !== current) {
        chain.push(formRedirect.url);
        current = formRedirect.url;
        method = formRedirect.method;
        body = formRedirect.body;
        continue;
      }

      const jsRedirect = html.match(/window\.location(?:\.href)?\s*=\s*["'`](https?:\/\/[^"'`]+)["'`]/)
        || html.match(/window\.location\.replace\(\s*["'`](https?:\/\/[^"'`]+)["'`]\s*\)/);
      if (jsRedirect) {
        const next = jsRedirect[1];
        if (next !== current) {
          chain.push(next);
          current = next;
          method = "GET";
          body = undefined;
          continue;
        }
      }

      const metaRefresh = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^;]+;\s*url=([^"']+)["']/i);
      if (metaRefresh) {
        try {
          const next = new URL(metaRefresh[1], current).href;
          if (next !== current) {
            chain.push(next);
            current = next;
            method = "GET";
            body = undefined;
            continue;
          }
        } catch {}
      }

      break;
    } catch {
      break;
    }
  }

  return chain;
}

export async function tryYtdlp(ytdlpPath: string, targetUrl: string): Promise<Record<string, unknown> | null> {
  try {
    const { stdout } = await execAsync(
      `${ytdlpPath} --dump-json --no-playlist --no-warnings --socket-timeout 15 "${targetUrl.replace(/"/g, '\\"')}"`,
      { timeout: 30000 }
    );
    const data = JSON.parse(stdout);
    const ext = (data.ext as string) || "";
    if (ext === "unknown_video" || ext === "none") return null;
    const hasUrl = !!(data.url || (data.formats && (data.formats as unknown[]).length > 0));
    return hasUrl ? data : null;
  } catch {
    return null;
  }
}

export async function tryHtmlFallback(startUrl: string, chain: string[]): Promise<{
  title: string | null;
  thumbnail: string | null;
  urls: Array<{ label: string; url: string; ext: string }>;
} | null> {
  const queue = chain.map((url) => ({ url, referer: startUrl }));
  const visited = new Set<string>();
  const videoUrls = new Set<string>();
  let title: string | null = null;
  let thumbnail: string | null = null;

  for (let depth = 0; depth < 5; depth++) {
    const currentBatch = queue.splice(0, queue.length);
    if (currentBatch.length === 0) break;

    for (const item of currentBatch) {
      if (visited.has(item.url)) continue;
      visited.add(item.url);

      try {
        const result = await fetchHtmlWithUaFallback(item.url, item.referer);
        if (!result) continue;

        const { html, finalUrl } = result;
        const effectiveUrl = finalUrl || item.url;

        title ||= extractTitle(html);
        thumbnail ||= extractThumbnail(html, effectiveUrl);

        for (const videoUrl of extractVideoUrls(html, effectiveUrl)) {
          videoUrls.add(videoUrl);
        }

        for (const nestedUrl of extractNestedPageUrls(html, effectiveUrl)) {
          if (!visited.has(nestedUrl)) queue.push({ url: nestedUrl, referer: effectiveUrl });
        }
      } catch {}
    }
  }

  const urls = Array.from(videoUrls).slice(0, 8).map((videoUrl, index) => ({
    label: index === 0 ? "Video" : `Video ${index + 1}`,
    url: videoUrl,
    ext: getUrlExt(videoUrl),
  }));

  if (urls.length === 0) return null;

  return { title, thumbnail, urls };
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc, key) => {
    if (acc && typeof acc === "object" && !Array.isArray(acc)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export type ExtractorProfileConfig = {
  endpoint?: string;
  requestMethod?: "GET" | "POST";
  videoIdExtractor?: string;
  videoUrlPath?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  bodyTemplate?: string;
};

export async function tryProfileExtraction(
  url: string,
  method: string,
  configJson: string,
  customUa?: string | null,
): Promise<string | null> {
  const cfg: ExtractorProfileConfig = (() => {
    try { return JSON.parse(configJson); } catch { return {}; }
  })();

  const ua = customUa || UA_LIST[0];

  if (method === "direct") {
    return await validateDirectVideoUrl(url) ? url : null;
  }

  if (method === "boodstream") {
    const result = await tryBoodstream(url);
    return result ? result.videoUrl : null;
  }

  if (method === "api") {
    if (!cfg.endpoint || !cfg.videoUrlPath) {
      console.warn("[ProfileExtract] api method requires endpoint + videoUrlPath");
      return null;
    }

    let videoId = "";
    if (cfg.videoIdExtractor) {
      const match = url.match(new RegExp(cfg.videoIdExtractor));
      videoId = match?.[1] ?? match?.[0] ?? "";
    }

    let apiUrl = cfg.endpoint.replace("{videoId}", encodeURIComponent(videoId));
    const reqMethod = cfg.requestMethod || "GET";
    const headers: Record<string, string> = {
      "User-Agent": ua,
      ...cfg.headers,
    };

    let body: string | undefined;
    if (reqMethod === "POST" && cfg.bodyTemplate) {
      body = cfg.bodyTemplate.replace("{videoId}", videoId);
      headers["Content-Type"] = "application/json";
    }

    if (reqMethod === "GET" && cfg.params) {
      const qs = new URLSearchParams({ ...cfg.params, ...(videoId ? { id: videoId } : {}) });
      apiUrl += (apiUrl.includes("?") ? "&" : "?") + qs.toString();
    }

    try {
      const resp = await fetch(apiUrl, {
        method: reqMethod,
        headers,
        body,
      });
      if (!resp.ok) {
        console.warn(`[ProfileExtract] API responded ${resp.status} for ${apiUrl}`);
        return null;
      }
      const data = await resp.json();
      const videoUrl = getNestedValue(data, cfg.videoUrlPath);
      if (typeof videoUrl === "string" && videoUrl.startsWith("http")) {
        return videoUrl;
      }
      console.warn(`[ProfileExtract] videoUrlPath '${cfg.videoUrlPath}' not found in response`, data);
      return null;
    } catch (err) {
      console.warn(`[ProfileExtract] API call failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  if (method === "html") {
    const result = await tryHtmlFallback(url, [url]);
    return result && result.urls.length > 0 ? result.urls[0].url : null;
  }

  if (method === "ytdlp") {
    const ytdlpPath = await resolveYtdlpPath();
    if (!ytdlpPath) return null;
    const info = await tryYtdlp(ytdlpPath, url);
    if (!info) return null;
    const formats = (info.formats as Array<Record<string, unknown>>) || [];
    const videoFormats = formats.filter((f) => {
      const vcodec = f.vcodec as string;
      return vcodec && vcodec !== "none" && f.url;
    });
    if (videoFormats.length > 0) {
      const sorted = [...videoFormats].sort((a, b) => ((b.height as number) || 0) - ((a.height as number) || 0));
      const best = sorted[0];
      if (best?.url) return best.url as string;
    }
    if (info.url) return info.url as string;
    return null;
  }

  console.warn(`[ProfileExtract] Unknown method: ${method}`);
  return null;
}

async function tryVidvfFolderFirstVideo(chain: string[]): Promise<string | null> {
  for (const candidate of chain) {
    let parsed: URL;
    try { parsed = new URL(candidate); } catch { continue; }
    const host = parsed.hostname.toLowerCase();
    if (!/(vidvf\.com|vidxlr\.de|vidzp\.com|videq\.in|vidral\.de|vdaq\.de)$/.test(host)) continue;
    try {
      const page = await fetch(candidate, { headers: { ...BROWSER_HEADERS, Referer: candidate }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (!page.ok) continue;
      const html = await page.text();
      const firstD = html.match(/href=["']([^"']*\/d\/[a-z0-9]+[^"']*)["']/i)?.[1];
      const dUrl = firstD ? (firstD.startsWith("http") ? firstD : `${parsed.origin}${firstD.startsWith("/") ? "" : "/"}${firstD}`) : candidate;
      const dPage = await fetch(dUrl, { headers: { ...BROWSER_HEADERS, Referer: candidate }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (!dPage.ok) continue;
      const dHtml = await dPage.text();
      const iframeId = dHtml.match(/iframeId\s*=\s*['"]([^'"]+)['"]/i)?.[1];
      if (!iframeId) continue;
      const iframeUrl = `${new URL(dUrl).origin}/ip129jk?id=${encodeURIComponent(iframeId)}`;
      const iPage = await fetch(iframeUrl, { headers: { ...BROWSER_HEADERS, Referer: dUrl }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (!iPage.ok) continue;
      const iHtml = await iPage.text();
      const embed = iHtml.match(/https?:\/\/[^"'<>\s]+embed\.php\?[^"'<>\s]+/i)?.[0];
      if (!embed) continue;
      const ePage = await fetch(embed, { headers: { ...BROWSER_HEADERS, Referer: iframeUrl }, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (!ePage.ok) continue;
      const eHtml = await ePage.text();
      const mp4 = eHtml.match(/https?:\/\/[^"'<>\s]+\.mp4(?:\?[^"'<>\s]*)?/i)?.[0];
      if (mp4) return mp4;
    } catch {}
  }
  return null;
}

export async function smartExtractVideoUrl(originalUrl: string): Promise<string> {
  let chain: string[] = [originalUrl];

  try {
    chain = await resolveJsRedirectChain(originalUrl);
    console.info(`[SmartExtract] Redirect chain for ${originalUrl}: ${chain.join(" → ")}`);
  } catch {
    console.warn(`[SmartExtract] Could not resolve redirect chain for ${originalUrl}, using original`);
  }

  // Expand chain with domain variants (cdn1 → media, cdn2, etc.)
  const expanded = [...chain];
  for (const candidate of chain) {
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      // twimg.co.in variants: cdn1, cdn2, media all serve same content differently
      if (host.match(/^(cdn\d+|media)\.twimg\.co\.in$/)) {
        const variants = ["media.twimg.co.in", "cdn2.videy.co"];
        for (const variant of variants) {
          const altUrl = `https://${variant}${url.pathname}`;
          if (!expanded.includes(altUrl)) expanded.push(altUrl);
        }
      }
    } catch {}
  }
  chain = expanded;

  for (const candidate of chain) {
    try {
      const pathname = new URL(candidate).pathname;
      const ext = pathname.split(".").pop()?.toLowerCase() || "";
      if (VIDEO_EXTENSIONS.includes(ext)) {
        if (await validateDirectVideoUrl(candidate, originalUrl)) {
          console.info(`[SmartExtract] Direct video URL found in chain: ${candidate}`);
          return candidate;
        }
        // URL has .mp4 extension but isn't a direct video — might be HTML wrapper with <video>/<source>
        // Try to extract real video URL from the HTML page
        try {
          const resp = await fetch(candidate, {
            headers: { ...BROWSER_HEADERS, Referer: originalUrl },
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          });
          if (resp.ok) {
            const ct = (resp.headers.get("content-type") || "").toLowerCase();
            if (ct.includes("html")) {
              const html = await resp.text();
              const sourceMatch = html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)/i);
              const videoSrcMatch = html.match(/<video[^>]+src=["']([^"']+\.mp4[^"']*)/i);
              const extractedUrl = sourceMatch?.[1] || videoSrcMatch?.[1];
              if (extractedUrl) {
                const fullUrl = extractedUrl.startsWith("http") ? extractedUrl : `https:${extractedUrl}`;
                if (await validateDirectVideoUrl(fullUrl, candidate)) {
                  console.info(`[SmartExtract] Extracted video from HTML wrapper: ${fullUrl.slice(0, 80)}`);
                  return fullUrl;
                }
                // Even if validation fails, return it — assertRealVideoUrl will accept HTML wrappers now
                console.info(`[SmartExtract] Found video source in HTML (unvalidated): ${fullUrl.slice(0, 80)}`);
                return fullUrl;
              }
            }
          }
        } catch {}
        console.info(`[SmartExtract] Skipping .${ext} URL that is not a real video: ${candidate}`);
      }
    } catch {}
  }

  for (const candidate of chain) {
    const bood = await tryBoodstream(candidate);
    if (bood) {
      console.info(`[SmartExtract] Boodstream found: ${bood.videoUrl.slice(0, 80)}`);
      return bood.videoUrl;
    }
  }

  const vidvfFirst = await tryVidvfFolderFirstVideo(chain);
  if (vidvfFirst) {
    console.info(`[SmartExtract] VidVF folder first video found: ${vidvfFirst.slice(0, 80)}`);
    return vidvfFirst;
  }

  const ytdlpPath = await resolveYtdlpPath();
  if (!ytdlpPath) {
    console.warn("[SmartExtract] yt-dlp not found, will skip to HTML fallback");
  }

  if (ytdlpPath) {
    try {
      let info: Record<string, unknown> | null = null;
      for (const candidate of chain) {
        info = await tryYtdlp(ytdlpPath, candidate);
        if (info) break;
      }

      if (info) {
        const formats = (info.formats as Array<Record<string, unknown>>) || [];
        const videoFormats = formats.filter((f) => {
          const vcodec = f.vcodec as string;
          return vcodec && vcodec !== "none" && f.url;
        });

        if (videoFormats.length > 0) {
          const sorted = [...videoFormats].sort((a, b) => ((b.height as number) || 0) - ((a.height as number) || 0));
          const best = sorted[0];
          if (best?.url) {
            console.info(`[SmartExtract] yt-dlp found direct URL (${(best.height as number) || "?"}p)`);
            return best.url as string;
          }
        }

        if (info.url) {
          console.info(`[SmartExtract] Using top-level URL from yt-dlp`);
          return info.url as string;
        }
      }
    } catch (err) {
      console.warn(`[SmartExtract] yt-dlp error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    const fallback = await tryHtmlFallback(originalUrl, chain);
    if (fallback && fallback.urls.length > 0) {
      const firstUrl = fallback.urls[0].url;
      console.info(`[SmartExtract] HTML fallback found: ${firstUrl.slice(0, 80)}`);
      return firstUrl;
    }
  } catch (err) {
    console.warn(`[SmartExtract] HTML fallback failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.warn(`[SmartExtract] No direct URL found, using original: ${originalUrl}`);
  return originalUrl;
}

export async function smartExtractVideoWithMeta(originalUrl: string): Promise<{ videoUrl: string; thumbnail: string | null }> {
  let chain: string[] = [originalUrl];

  try {
    chain = await resolveJsRedirectChain(originalUrl);
  } catch {}

  for (const candidate of chain) {
    try {
      const pathname = new URL(candidate).pathname;
      const ext = pathname.split(".").pop()?.toLowerCase() || "";
      if (VIDEO_EXTENSIONS.includes(ext) && await validateDirectVideoUrl(candidate, originalUrl)) {
        return { videoUrl: candidate, thumbnail: null };
      }
    } catch {}
  }

  for (const candidate of chain) {
    const bood = await tryBoodstream(candidate);
    if (bood) return { videoUrl: bood.videoUrl, thumbnail: null };
  }

  try {
    const fallback = await tryHtmlFallback(originalUrl, chain);
    if (fallback && fallback.urls.length > 0) {
      return { videoUrl: fallback.urls[0].url, thumbnail: fallback.thumbnail };
    }
  } catch {}

  return { videoUrl: originalUrl, thumbnail: null };
}
