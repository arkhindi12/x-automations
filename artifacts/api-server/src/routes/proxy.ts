import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();
const defaultBaseUrl = "https://api.9proxy.com";

async function getNineproxyApiKey() {
  const envKey = process.env.NINEPROXY_API_KEY?.trim();
  if (envKey) return envKey;
  const [settings] = await db.select({ nineproxyApiKey: settingsTable.nineproxyApiKey }).from(settingsTable).where(eq(settingsTable.id, 1));
  return settings?.nineproxyApiKey?.trim() ?? "";
}

async function getNineproxyGateway() {
  const envGateway = process.env.NINEPROXY_GATEWAY?.trim();
  if (envGateway) return envGateway;
  const [settings] = await db
    .select({ nineproxyGateway: settingsTable.nineproxyGateway })
    .from(settingsTable)
    .where(eq(settingsTable.id, 1));
  return settings?.nineproxyGateway?.trim() ?? "";
}

function buildNineproxyUrl(baseUrl: string, path: string, apiKey: string, extra: Record<string, string> = {}) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("api-key", apiKey);
  for (const [k, v] of Object.entries(extra)) {
    if (v) url.searchParams.set(k, v);
  }
  return url;
}

router.get("/9proxy/status", async (_req, res) => {
  const apiKey = await getNineproxyApiKey();
  const gateway = await getNineproxyGateway();
  res.json({
    configured: Boolean(apiKey),
    gatewayConfigured: Boolean(gateway),
    baseUrl: process.env.NINEPROXY_BASE_URL ?? defaultBaseUrl,
  });
});

router.get("/9proxy", async (req, res) => {
  const apiKey = await getNineproxyApiKey();
  if (!apiKey) {
    return res.status(400).json({ error: "9Proxy API key belum dikonfigurasi. Tambahkan di halaman Settings." });
  }

  const baseUrl = process.env.NINEPROXY_BASE_URL ?? defaultBaseUrl;

  const limit = typeof req.query.limit === "string" && req.query.limit.trim() ? req.query.limit.trim() : "50";
  const page = typeof req.query.page === "string" && req.query.page.trim() ? req.query.page.trim() : "1";

  try {
    const userPassUrl = buildNineproxyUrl(baseUrl, "/client/v1/user-passes/get-list", apiKey, { limit, page });

    const upResponse = await fetch(userPassUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const upPayload = await upResponse.json().catch(() => null);

    if (!upResponse.ok) {
      const msg =
        upPayload && typeof upPayload === "object" && "message" in upPayload
          ? String((upPayload as { message: unknown }).message)
          : `9Proxy request failed with HTTP ${upResponse.status}.`;
      return res.status(upResponse.status).json({ error: msg });
    }

    const rawUsers: Array<{ user_name?: string; use_key?: string; status?: number }> = [];
    if (upPayload && typeof upPayload === "object") {
      const data = (upPayload as Record<string, unknown>).data;
      if (Array.isArray(data)) rawUsers.push(...data);
    }

    const gateway = await getNineproxyGateway();

    const proxies: string[] = rawUsers
      .filter((u) => u.user_name && u.use_key)
      .map((u) => {
        const user = encodeURIComponent(u.user_name!);
        const pass = encodeURIComponent(u.use_key!);
        if (gateway) {
          return `http://${user}:${pass}@${gateway}`;
        }
        return `${u.user_name}:${u.use_key}`;
      });

    res.json({
      configured: true,
      endpoint: "user-passes",
      count: proxies.length,
      proxies,
      hasGateway: Boolean(gateway),
      note: gateway
        ? undefined
        : "Gateway 9Proxy belum dikonfigurasi di Settings. Isi field '9Proxy Gateway Host:Port' agar proxy URL lengkap otomatis terbentuk.",
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Unable to connect to 9Proxy API." });
  }
});

export default router;
