import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();
const settingsId = 1;

function maskKey(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return "configured";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function parseEmbedDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((d) => typeof d === "string" && d.trim()).map((d) => d.trim());
  } catch {}
  return [];
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  return null;
}

async function getSettingsRow() {
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, settingsId));
  return settings ?? null;
}

function buildSeoPayload(settings: typeof settingsTable.$inferSelect | null) {
  return {
    siteName: settings?.siteName ?? null,
    siteTitle: settings?.siteTitle ?? null,
    siteDescription: settings?.siteDescription ?? null,
    siteKeywords: settings?.siteKeywords ?? null,
    ogImage: settings?.ogImage ?? null,
    faviconUrl: settings?.faviconUrl ?? null,
    twitterCard: settings?.twitterCard ?? "summary_large_image",
    twitterSite: settings?.twitterSite ?? null,
    googleAnalyticsId: settings?.googleAnalyticsId ?? null,
    googleTagManagerId: settings?.googleTagManagerId ?? null,
    metaPixelId: settings?.metaPixelId ?? null,
    customHeadHtml: settings?.customHeadHtml ?? null,
    robotsIndex: settings?.robotsIndex ?? "index, follow",
  };
}

router.get("/", async (_req, res) => {
  const settings = await getSettingsRow();
  const envKey = process.env.NINEPROXY_API_KEY;
  const key = settings?.nineproxyApiKey ?? envKey ?? null;

  const embedDomains = parseEmbedDomains(settings?.embedDomains);
  if (embedDomains.length === 0 && settings?.embedDomain?.trim()) {
    embedDomains.push(settings.embedDomain.trim());
  }

  res.json({
    nineproxyConfigured: Boolean(key?.trim()),
    nineproxyApiKeyMasked: maskKey(key),
    nineproxyGateway: settings?.nineproxyGateway ?? process.env.NINEPROXY_GATEWAY ?? null,
    embedDomain: settings?.embedDomain ?? null,
    embedDomains,
    doodstreamConfigured: Boolean(settings?.doodstreamApiKey?.trim()),
    doodstreamApiKeyMasked: maskKey(settings?.doodstreamApiKey),
    streamtapeConfigured: Boolean(settings?.streamtapeLogin?.trim() && settings?.streamtapeKey?.trim()),
    streamtapeLoginMasked: maskKey(settings?.streamtapeLogin),
    followRepostSource: settings?.followRepostSource ?? true,
    blockedDomains: settings?.blockedDomains ?? null,
    timezone: settings?.timezone ?? "Asia/Jakarta",
    source: settings?.nineproxyApiKey ? "settings" : envKey ? "secret" : null,
    ...buildSeoPayload(settings),
  });
});

router.put("/", async (req, res) => {
  const current = await getSettingsRow();
  let nineproxyApiKey = current?.nineproxyApiKey ?? null;
  let nineproxyGateway = current?.nineproxyGateway ?? null;
  let embedDomain = current?.embedDomain ?? null;
  let doodstreamApiKey = current?.doodstreamApiKey ?? null;
  let streamtapeLogin = current?.streamtapeLogin ?? null;
  let streamtapeKey = current?.streamtapeKey ?? null;
  let followRepostSource = current?.followRepostSource ?? true;
  let blockedDomains = current?.blockedDomains ?? null;
  let timezone = current?.timezone ?? "Asia/Jakarta";

  let embedDomains = parseEmbedDomains(current?.embedDomains);
  if (embedDomains.length === 0 && current?.embedDomain?.trim()) {
    embedDomains = [current.embedDomain.trim()];
  }

  if (req.body?.clearNineproxyApiKey === true) {
    nineproxyApiKey = null;
  } else if (typeof req.body?.nineproxyApiKey === "string" && req.body.nineproxyApiKey.trim()) {
    nineproxyApiKey = req.body.nineproxyApiKey.trim();
  }

  if (typeof req.body?.nineproxyGateway === "string") {
    nineproxyGateway = req.body.nineproxyGateway.trim() || null;
  }

  if (typeof req.body?.embedDomain === "string") {
    embedDomain = req.body.embedDomain.trim() || null;
  }

  if (req.body?.clearDoodstreamApiKey === true) {
    doodstreamApiKey = null;
  } else if (typeof req.body?.doodstreamApiKey === "string" && req.body.doodstreamApiKey.trim()) {
    doodstreamApiKey = req.body.doodstreamApiKey.trim();
  }

  if (req.body?.clearStreamtape === true) {
    streamtapeLogin = null;
    streamtapeKey = null;
  } else {
    if (typeof req.body?.streamtapeLogin === "string" && req.body.streamtapeLogin.trim()) {
      streamtapeLogin = req.body.streamtapeLogin.trim();
    }
    if (typeof req.body?.streamtapeKey === "string" && req.body.streamtapeKey.trim()) {
      streamtapeKey = req.body.streamtapeKey.trim();
    }
  }

  if (typeof req.body?.followRepostSource === "boolean") {
    followRepostSource = req.body.followRepostSource;
  }

  if (typeof req.body?.blockedDomains === "string") {
    blockedDomains = req.body.blockedDomains.trim() || null;
  }

  if (typeof req.body?.timezone === "string" && req.body.timezone.trim()) {
    timezone = req.body.timezone.trim();
  }

  if (Array.isArray(req.body?.embedDomains)) {
    embedDomains = (req.body.embedDomains as unknown[])
      .filter((d) => typeof d === "string" && (d as string).trim())
      .map((d) => (d as string).trim());
  }

  if (typeof req.body?.addDomain === "string" && req.body.addDomain.trim()) {
    const newDomain = req.body.addDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!embedDomains.includes(newDomain)) embedDomains = [...embedDomains, newDomain];
    embedDomain = embedDomains[0] ?? null;
  }

  if (typeof req.body?.removeDomain === "string" && req.body.removeDomain.trim()) {
    embedDomains = embedDomains.filter((d) => d !== req.body.removeDomain.trim());
    embedDomain = embedDomains[0] ?? null;
  }

  const embedDomainsJson = embedDomains.length > 0 ? JSON.stringify(embedDomains) : null;

  // SEO fields
  const seoFields: Partial<typeof settingsTable.$inferInsert> = {};
  const seoKeys = ["siteName","siteTitle","siteDescription","siteKeywords","ogImage","faviconUrl","twitterCard","twitterSite","googleAnalyticsId","googleTagManagerId","metaPixelId","customHeadHtml","robotsIndex"] as const;
  for (const key of seoKeys) {
    if (key in req.body) {
      (seoFields as Record<string, string | null>)[key] = str(req.body[key]);
    }
  }

  const [settings] = await db.insert(settingsTable).values({
    id: settingsId,
    nineproxyApiKey,
    nineproxyGateway,
    embedDomain,
    embedDomains: embedDomainsJson,
    doodstreamApiKey,
    streamtapeLogin,
    streamtapeKey,
    followRepostSource,
    blockedDomains,
    timezone,
    ...seoFields,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: settingsTable.id,
    set: {
      nineproxyApiKey,
      nineproxyGateway,
      embedDomain,
      embedDomains: embedDomainsJson,
      doodstreamApiKey,
      streamtapeLogin,
      streamtapeKey,
      followRepostSource,
      blockedDomains,
      timezone,
      ...seoFields,
      updatedAt: new Date(),
    },
  }).returning();

  const envKey = process.env.NINEPROXY_API_KEY;
  const key = settings.nineproxyApiKey ?? envKey ?? null;

  const updatedDomains = parseEmbedDomains(settings?.embedDomains);
  if (updatedDomains.length === 0 && settings?.embedDomain?.trim()) {
    updatedDomains.push(settings.embedDomain.trim());
  }

  res.json({
    nineproxyConfigured: Boolean(key?.trim()),
    nineproxyApiKeyMasked: maskKey(key),
    nineproxyGateway: settings.nineproxyGateway ?? process.env.NINEPROXY_GATEWAY ?? null,
    embedDomain: settings.embedDomain ?? null,
    embedDomains: updatedDomains,
    timezone: settings.timezone ?? "Asia/Jakarta",
    doodstreamConfigured: Boolean(settings.doodstreamApiKey?.trim()),
    doodstreamApiKeyMasked: maskKey(settings.doodstreamApiKey),
    streamtapeConfigured: Boolean(settings.streamtapeLogin?.trim() && settings.streamtapeKey?.trim()),
    streamtapeLoginMasked: maskKey(settings.streamtapeLogin),
    followRepostSource: settings.followRepostSource ?? true,
    blockedDomains: settings.blockedDomains ?? null,
    source: settings.nineproxyApiKey ? "settings" : envKey ? "secret" : null,
    ...buildSeoPayload(settings),
  });
});

export default router;
