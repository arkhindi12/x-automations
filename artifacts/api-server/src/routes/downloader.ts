import { Router } from "express";
import { logger } from "../lib/logger";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  BROWSER_HEADERS,
  resolveJsRedirectChain,
  tryYtdlp,
  tryHtmlFallback,
  tryBoodstream,
  extractVideoUrls,
  getUrlExt,
  resolveYtdlpPath,
  tryProfileExtraction,
  validateDirectVideoUrl,
  isMarketplaceAdUrl,
} from "../lib/smart-extractor";
import { db } from "@workspace/db";
import { extractorProfilesTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const execAsync = promisify(exec);

const router = Router();

async function recordAutoExtractorProfile(sourceUrl: string, method: string, config: Record<string, unknown> = {}) {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
    const [existing] = await db
      .select()
      .from(extractorProfilesTable)
      .where(and(
        eq(extractorProfilesTable.domainPattern, hostname),
        eq(extractorProfilesTable.method, method),
      ))
      .limit(1);

    if (existing) {
      await db
        .update(extractorProfilesTable)
        .set({
          successCount: sql`${extractorProfilesTable.successCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(extractorProfilesTable.id, existing.id));
      return { id: existing.id, name: existing.name, method: existing.method, autoCreated: false };
    }

    const [profile] = await db
      .insert(extractorProfilesTable)
      .values({
        name: `Auto ${hostname} (${method})`,
        domainPattern: hostname,
        urlPattern: null,
        method,
        config: JSON.stringify(config),
        customUa: null,
        priority: -10,
        isActive: true,
        successCount: 1,
        failCount: 0,
        notes: `Dibuat otomatis setelah extract sukses dari ${sourceUrl}`,
      })
      .returning();

    return { id: profile.id, name: profile.name, method: profile.method, autoCreated: true };
  } catch (err) {
    logger.warn({ err, sourceUrl, method }, "Failed to record auto extractor profile");
    return null;
  }
}

async function inspectRedirectChain(startUrl: string): Promise<Array<{ url: string; contentType: string | null; status: number | null }>> {
  const rawChain = await resolveJsRedirectChain(startUrl);
  const inspected: Array<{ url: string; contentType: string | null; status: number | null }> = [];

  for (const item of rawChain) {
    try {
      const response = await fetch(item, {
        method: "GET",
        redirect: "follow",
        headers: {
          ...BROWSER_HEADERS,
          "Range": "bytes=0-0",
        },
      });
      inspected.push({
        url: item,
        contentType: response.headers.get("content-type"),
        status: response.status,
      });
      if (response.url && response.url !== item && !rawChain.includes(response.url)) {
        inspected.push({
          url: response.url,
          contentType: response.headers.get("content-type"),
          status: response.status,
        });
      }
    } catch {
      inspected.push({
        url: item,
        contentType: null,
        status: null,
      });
    }
  }

  return inspected;
}

function buildYtdlpPayload(info: Record<string, unknown>) {
  const title = (info.title as string) || null;
  const ext = (info.ext as string) || "mp4";
  const duration = (info.duration as number) || null;
  const thumbnail = (info.thumbnail as string) || null;
  const uploader = (info.uploader as string) || null;
  const formats = (info.formats as Array<Record<string, unknown>>) || [];
  const videoFormats = formats.filter((f) => {
    const vcodec = f.vcodec as string;
    return vcodec && vcodec !== "none";
  });
  const urls: Array<{ label: string; url: string; ext: string; height?: number; filesize?: number }> = [];

  if (videoFormats.length > 0) {
    const sorted = [...videoFormats].sort((a, b) => ((b.height as number) || 0) - ((a.height as number) || 0));
    for (const f of sorted.slice(0, 5)) {
      if (f.url) {
        const height = f.height as number | undefined;
        const filesize = (f.filesize || f.filesize_approx) as number | undefined;
        urls.push({
          label: height ? `${height}p` : (f.format_note as string) || (f.format as string) || "Video",
          url: f.url as string,
          ext: (f.ext as string) || ext,
          height,
          filesize,
        });
      }
    }
  }

  if (urls.length === 0 && info.url) {
    urls.push({ label: "Video", url: info.url as string, ext });
  }

  return {
    title,
    ext,
    duration,
    thumbnail,
    uploader,
    directUrl: (info.url as string) || urls[0]?.url || null,
    urls,
  };
}

router.post("/smart", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL diperlukan" });
  }

  let normalizedUrl = url.trim();
  
  // Auto-add https:// if no protocol
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    return res.status(400).json({ error: "URL tidak valid" });
  }

  try {
    const ytdlpPath = await resolveYtdlpPath();
    if (!ytdlpPath) {
      return res.status(500).json({ error: "yt-dlp tidak ditemukan di server. Hubungi administrator." });
    }

    const chain = await resolveJsRedirectChain(normalizedUrl);
    logger.info({ chain }, "Resolved redirect chain");

    const extractionChain: string[] = [];
    const skipped: string[] = [];
    for (const item of chain) {
      if (await isMarketplaceAdUrl(item)) skipped.push(item);
      else extractionChain.push(item);
    }
    if (skipped.length > 0) {
      logger.info({ skipped }, "Skipping marketplace ad redirect URLs");
    }

    const VIDEO_EXTENSIONS = ["mp4", "m3u8", "webm", "mkv", "avi", "mov", "flv", "ts", "wmv"];
    const profiles = await db
      .select()
      .from(extractorProfilesTable)
      .where(eq(extractorProfilesTable.isActive, true))
      .orderBy(desc(extractorProfilesTable.priority));

    for (const candidate of extractionChain) {
      let hostname: string;
      try { hostname = new URL(candidate).hostname.toLowerCase(); } catch { continue; }

      const matching = profiles.filter((p) => {
        const dp = p.domainPattern.toLowerCase();
        if (dp.startsWith("*.")) {
          const base = dp.slice(2);
          return hostname === base || hostname.endsWith("." + base);
        }
        return hostname === dp || hostname.endsWith("." + dp);
      });

      for (const profile of matching) {
        if (profile.urlPattern) {
          try {
            if (!new RegExp(profile.urlPattern).test(candidate)) continue;
          } catch {}
        }
        logger.info({ profileId: profile.id, profileName: profile.name, candidate }, "Trying extractor profile");
        const extracted = await tryProfileExtraction(candidate, profile.method, profile.config, profile.customUa);
        if (extracted) {
          await db.update(extractorProfilesTable)
            .set({ successCount: sql`${extractorProfilesTable.successCount} + 1`, updatedAt: new Date() })
            .where(eq(extractorProfilesTable.id, profile.id));
          const ext = getUrlExt(extracted);
          const redirectChain = await inspectRedirectChain(url);
          return res.json({
            success: true,
            title: profile.name,
            ext,
            duration: null,
            thumbnail: null,
            uploader: profile.name,
            directUrl: extracted,
            urls: [{ label: "Video", url: extracted, ext }],
            redirectChain,
            profileUsed: { id: profile.id, name: profile.name, method: profile.method },
            sourceUrl: candidate,
          });
        } else {
          await db.update(extractorProfilesTable)
            .set({ failCount: sql`${extractorProfilesTable.failCount} + 1`, updatedAt: new Date() })
            .where(eq(extractorProfilesTable.id, profile.id));
        }
      }

      try {
        const pathname = new URL(candidate).pathname;
        const ext = pathname.split(".").pop()?.toLowerCase() || "";
        if (VIDEO_EXTENSIONS.includes(ext) && await validateDirectVideoUrl(candidate, url)) {
          logger.info({ url: candidate, ext }, "Direct video URL found in redirect chain");
          const filename = pathname.split("/").pop() || `video.${ext}`;
          const redirectChain = await inspectRedirectChain(url);
          const autoProfile = await recordAutoExtractorProfile(candidate, "direct");
          return res.json({
            success: true,
            title: filename.replace(/\.[^.]+$/, ""),
            ext,
            duration: null,
            thumbnail: null,
            uploader: null,
            directUrl: candidate,
            urls: [{ label: "Video", url: candidate, ext }],
            redirectChain,
            profileUsed: autoProfile,
            sourceUrl: candidate,
          });
        } else if (VIDEO_EXTENSIONS.includes(ext)) {
          logger.info({ url: candidate, ext }, "Skipping direct-looking URL because response is not video");
        }
      } catch {}

      const bood = await tryBoodstream(candidate);
      if (bood) {
        logger.info({ url: bood.videoUrl }, "Boodstream video URL found");
        const ext = getUrlExt(bood.videoUrl);
        const redirectChain = await inspectRedirectChain(url);
        const autoProfile = await recordAutoExtractorProfile(candidate, "boodstream");
        return res.json({
          success: true,
          title: bood.title,
          ext,
          duration: null,
          thumbnail: null,
          uploader: "Boodstream",
          directUrl: bood.videoUrl,
          urls: [{ label: "Video", url: bood.videoUrl, ext }],
          redirectChain,
          profileUsed: autoProfile,
          sourceUrl: candidate,
        });
      }

      const info = await tryYtdlp(ytdlpPath, candidate);
      if (info) {
        const autoProfile = await recordAutoExtractorProfile(candidate, "ytdlp");
        return res.json({
          success: true,
          ...buildYtdlpPayload(info),
          redirectChain: await inspectRedirectChain(url),
          profileUsed: autoProfile,
          sourceUrl: candidate,
        });
      }

      const fallback = await tryHtmlFallback(candidate, [candidate]);
      if (fallback) {
        const autoProfile = await recordAutoExtractorProfile(candidate, "html");
        return res.json({
          success: true,
          title: fallback.title,
          ext: fallback.urls[0]?.ext || "mp4",
          duration: null,
          thumbnail: fallback.thumbnail,
          uploader: null,
          directUrl: fallback.urls[0]?.url || null,
          urls: fallback.urls,
          redirectChain: await inspectRedirectChain(url),
          profileUsed: autoProfile,
          sourceUrl: candidate,
        });
      }
    }

      const redirectChain = await inspectRedirectChain(url);
      const expiredPage = redirectChain.find((item) => {
        if (item.status === 404) return true;
        try {
          const parsed = new URL(item.url);
          return parsed.pathname === "/404" || parsed.pathname.endsWith("/404");
        } catch {
          return false;
        }
      });
      const downSite = redirectChain.find((item) => item.status !== null && item.status >= 500);
      const blockedSite = redirectChain.find((item) => item.status === 403 || item.status === 401);
      let errorMsg = "Tidak bisa menemukan video. Situs ini mungkin tidak didukung atau diproteksi JavaScript.";
      let canUseBasicExtract = true;
      if (expiredPage) {
        const host = (() => { try { return new URL(expiredPage.url).hostname; } catch { return expiredPage.url; } })();
        errorMsg = `Link video sudah tidak tersedia atau redirect berakhir ke halaman 404 (${host}). Coba gunakan link sumber yang masih aktif.`;
        canUseBasicExtract = false;
      } else if (downSite) {
        const host = (() => { try { return new URL(downSite.url).hostname; } catch { return downSite.url; } })();
        errorMsg = `Server video (${host}) sedang tidak bisa diakses (error ${downSite.status}). Coba lagi nanti.`;
        canUseBasicExtract = false;
      } else if (blockedSite) {
        const host = (() => { try { return new URL(blockedSite.url).hostname; } catch { return blockedSite.url; } })();
        errorMsg = `Akses ke ${host} diblokir (${blockedSite.status}). Situs ini memerlukan autentikasi atau membatasi akses server.`;
        canUseBasicExtract = false;
      }
      return res.status(422).json({
        error: errorMsg,
        detail: `Redirect chain: ${redirectChain.map((item) => item.url).join(" → ")}`,
        redirectChain,
        canUseBasicExtract,
      });
  } catch (error: unknown) {
    const err = error as { message?: string; stderr?: string };
    logger.error(error, "yt-dlp smart extract error");
    res.status(500).json({ error: "Terjadi kesalahan saat mencari video", detail: (err.message || "").slice(0, 200) });
  }
});

router.post("/redirect-chain", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL diperlukan" });
  }

  let normalizedUrl = url.trim();
  
  // Auto-add https:// if no protocol
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    return res.status(400).json({ error: "URL tidak valid" });
  }

  try {
    const redirectChain = await inspectRedirectChain(normalizedUrl);
    res.json({
      success: true,
      redirectChain,
      finalUrl: redirectChain.at(-1)?.url || normalizedUrl,
    });
  } catch (error) {
    logger.error(error, "Redirect chain inspect error");
    res.status(500).json({ error: "Gagal mengecek redirect chain" });
  }
});

router.post("/smart/download", async (req, res) => {
  const { url, filename } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL diperlukan" });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "URL tidak valid" });
  }

  const tmpDir = os.tmpdir();
  const safeFilename = (filename || "video").replace(/[^a-zA-Z0-9._-]/g, "_");
  const outPath = path.join(tmpDir, `ytdlp_${Date.now()}_${safeFilename}`);

  try {
    const ytdlpPath = await resolveYtdlpPath();
    if (!ytdlpPath) {
      return res.status(500).json({ error: "yt-dlp tidak ditemukan di server. Hubungi administrator." });
    }

    await execAsync(
      `"${ytdlpPath}" --no-playlist --no-warnings --socket-timeout 15 -o "${outPath}" "${url.replace(/"/g, '\\"')}"`,
      { timeout: 120000 }
    );

    const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(`ytdlp_${Date.now().toString().slice(0, 8)}`));
    const actualFile = files.length > 0 ? path.join(tmpDir, files[0]) : outPath;
    const finalFile = fs.existsSync(actualFile) ? actualFile : `${outPath}`;

    const candidates = [outPath, `${outPath}.mp4`, `${outPath}.webm`, `${outPath}.mkv`];
    const found = candidates.find((p) => fs.existsSync(p));

    if (!found) {
      return res.status(500).json({ error: "File download selesai tapi tidak ditemukan" });
    }

    const dlFilename = path.basename(found);
    const ext = path.extname(found) || ".mp4";
    const contentType = ext === ".webm" ? "video/webm" : ext === ".mkv" ? "video/x-matroska" : "video/mp4";

    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}${ext}"`);
    res.setHeader("Content-Type", contentType);

    const stream = fs.createReadStream(found);
    stream.pipe(res);
    stream.on("end", () => {
      try { fs.unlinkSync(found); } catch {}
    });
    stream.on("error", () => {
      try { fs.unlinkSync(found); } catch {}
      if (!res.headersSent) res.status(500).json({ error: "Gagal membaca file" });
    });
  } catch (error: unknown) {
    const err = error as { message?: string; stderr?: string };
    logger.error(error, "yt-dlp smart download error");
    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
    if (!res.headersSent) {
      res.status(500).json({ error: "yt-dlp gagal mendownload video", detail: (err.stderr || err.message || "").slice(0, 300) });
    }
  }
});

router.post("/extract", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL diperlukan" });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "URL tidak valid" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": `${parsed.protocol}//${parsed.host}/`,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Tidak bisa mengakses halaman: ${response.statusText}` });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return res.json({
        videoUrls: [],
        message: "URL ini bukan halaman HTML — gunakan Download langsung",
        isDirectFile: true,
      });
    }

    const html = await response.text();
    const videoUrls = extractVideoUrls(html, url);

    res.json({
      videoUrls,
      message: videoUrls.length > 0
        ? `Ditemukan ${videoUrls.length} kemungkinan link video`
        : "Tidak ditemukan link video langsung di halaman ini",
      isDirectFile: false,
    });
  } catch (error) {
    logger.error(error, "Downloader extract error");
    res.status(500).json({ error: "Gagal mengekstrak link video" });
  }
});

router.post("/info", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL diperlukan" });
  }

  let normalizedUrl = url.trim();
  
  // Auto-add https:// if no protocol
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    return res.status(400).json({ error: "URL tidak valid" });
  }

  try {
    const response = await fetch(normalizedUrl, {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      const getResponse = await fetch(normalizedUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Range": "bytes=0-0",
        },
      });
      if (!getResponse.ok) {
        return res.status(getResponse.status).json({ error: `Tidak bisa akses URL: ${getResponse.statusText}` });
      }
      const urlObj = new URL(normalizedUrl);
      const filename = urlObj.pathname.split("/").pop() || "download";
      return res.json({
        filename,
        contentType: getResponse.headers.get("content-type") || "application/octet-stream",
        contentLength: null,
        accessible: true,
      });
    }

    const urlObj = new URL(normalizedUrl);
    const filename = urlObj.pathname.split("/").pop() || "download";
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");

    res.json({
      filename,
      contentType,
      contentLength: contentLength ? parseInt(contentLength) : null,
      accessible: true,
    });
  } catch (error) {
    logger.error(error, "Downloader info error");
    res.status(500).json({ error: "Gagal mengambil info URL" });
  }
});

router.post("/download", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL diperlukan" });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "URL tidak valid" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${parsed.protocol}//${parsed.host}/`,
        "Accept": "*/*",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Tidak bisa mengakses URL: ${response.statusText}` });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentLength = response.headers.get("content-length");
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split("/").pop() || "download";

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);

    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      };
      await pump();
    } else {
      res.end();
    }
  } catch (error) {
    logger.error(error, "Downloader download error");
    if (!res.headersSent) res.status(500).json({ error: "Gagal mendownload file" });
  }
});

export default router;
