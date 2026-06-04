import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable, type Account } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateAccountBody, UpdateAccountBody, GetAccountParams, UpdateAccountParams, DeleteAccountParams } from "@workspace/api-zod";
import { parseCookieInput, verifyCookieSession, checkCookieHealth } from "../lib/x-web-client";
import { authLimiter, strictLimiter } from "../lib/rate-limiter";
import { accountLogger } from "../lib/structured-logger";

const router = Router();

const credentialFields = ["bearerToken", "apiKey", "apiSecret", "accessToken", "accessTokenSecret"] as const;
type CredentialField = typeof credentialFields[number];
type AccountInput = Partial<Record<CredentialField, string>> & {
  username?: string;
  proxyUrl?: string | null;
  authMode?: "oauth" | "cookies";
  cookieJson?: string | null;
  cookieUserAgent?: string | null;
};

function normalizeUsername(username: string) {
  return username.trim().replace(/^@+/, "");
}

function normalizeProxyUrl(proxyUrl: string | null | undefined) {
  const trimmed = proxyUrl?.trim();
  if (!trimmed) return null;

  // Support multi-line proxy list (one per line or comma-separated)
  const lines = trimmed.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);

  const validated: string[] = [];
  for (const line of lines) {
    let parsed: URL;
    try {
      parsed = new URL(line);
    } catch {
      throw new Error(`Proxy URL is invalid: ${line.slice(0, 50)}`);
    }

    if (!["http:", "https:", "socks4:", "socks5:"].includes(parsed.protocol)) {
      throw new Error(`Proxy URL must use http, https, socks4, or socks5: ${line.slice(0, 50)}`);
    }

    // Store without trailing slash to avoid proxy issues
    validated.push(line.replace(/\/+$/, ""));
  }

  return validated.join("\n");
}

function maskProxyUrl(proxyUrl: string | null) {
  // Return as-is — no masking. User needs to see the full URL to edit/delete properly.
  return proxyUrl || null;
}

function toSafeAccount(account: Account) {
  const {
    bearerToken, apiKey, apiSecret, accessToken, accessTokenSecret,
    cookieAuthToken, cookieCt0, cookieRawHeader, ...safeAccount
  } = account;
  return {
    ...safeAccount,
    proxyUrl: maskProxyUrl(account.proxyUrl),
    hasCredentials: Boolean(bearerToken && apiKey && apiSecret && accessToken && accessTokenSecret),
    hasCookies: Boolean(cookieAuthToken && cookieCt0),
  };
}

function hasMaskedCredential(input: string | undefined) {
  if (!input) return false;
  return /^[•*xX._-]+$/.test(input.trim());
}

function getProvidedCredentialFields(input: AccountInput) {
  return credentialFields.filter((field) => input[field]?.trim());
}

function requireCredentials(input: AccountInput) {
  const missingFields = credentialFields.filter((field) => !input[field]?.trim());
  if (missingFields.length > 0) {
    throw new Error(`Missing required credentials: ${missingFields.join(", ")}.`);
  }

  const maskedFields = credentialFields.filter((field) => hasMaskedCredential(input[field]));
  if (maskedFields.length > 0) {
    throw new Error("Masked credential values cannot be saved. Enter the real credential values.");
  }
}

function normalizeAuthMode(input: AccountInput): "oauth" | "cookies" {
  const mode = input.authMode;
  return mode === "cookies" ? "cookies" : "oauth";
}

function normalizeAccountInput<T extends AccountInput>(input: T): T & {
  username: string;
  proxyUrl: string | null;
  authMode: "oauth" | "cookies";
  cookieUserAgent: string | null;
} {
  const username = normalizeUsername(input.username ?? "");
  if (!username) {
    throw new Error("Username is required.");
  }
  const cookieUa = input.cookieUserAgent?.trim() || null;

  return {
    ...input,
    username,
    proxyUrl: normalizeProxyUrl(input.proxyUrl),
    authMode: normalizeAuthMode(input),
    cookieUserAgent: cookieUa,
  };
}

async function verifyXCredentials(input: AccountInput) {
  requireCredentials(input);

  const username = normalizeUsername(input.username ?? "");
  if (!username) {
    throw new Error("Username is required before testing credentials.");
  }

  const bearerToken = input.bearerToken?.trim();
  const urls = [
    `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=id,username`,
    `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=id,username`,
  ];

  let networkError: unknown = null;

  for (const url of urls) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      networkError = error;
      continue;
    }

    const payload = await response.json().catch(() => null) as { data?: { username?: string }, detail?: string, title?: string, errors?: Array<{ detail?: string, title?: string }> } | null;

    if (response.status === 401 || response.status === 403) {
      throw new Error("Bearer Token rejected by X API. Check the token permissions and value.");
    }

    if (response.status === 404) {
      throw new Error(`X username @${username} was not found.`);
    }

    if (!response.ok) {
      const detail = payload?.detail ?? payload?.errors?.[0]?.detail ?? payload?.title ?? `HTTP ${response.status}`;
      throw new Error(`X API validation failed: ${detail}`);
    }

    if (payload?.data?.username && payload.data.username.toLowerCase() !== username.toLowerCase()) {
      throw new Error("X API returned a different username than the account being saved.");
    }

    return {
      ok: true,
      message: `Credentials validated for @${payload?.data?.username ?? username}.`,
    };
  }

  throw new Error(networkError instanceof Error ? networkError.message : "Unable to reach X API for credential validation.");
}

type CookieValidationResult = {
  authToken: string;
  ct0: string;
  rawHeader: string | null;
  message: string;
};

type LoginDiagnosticReason =
  | "OK"
  | "USERNAME_REQUIRED"
  | "COOKIE_REQUIRED"
  | "COOKIE_JSON_INVALID"
  | "AUTH_TOKEN_MISSING"
  | "CT0_MISSING"
  | "COOKIE_EXPIRED"
  | "USERNAME_MISMATCH"
  | "PROXY_ERROR"
  | "NETWORK_TIMEOUT"
  | "RATE_LIMITED"
  | "OAUTH_REJECTED"
  | "USERNAME_NOT_FOUND"
  | "UNKNOWN_ERROR";

function diagnoseLoginError(error: unknown): { reason: LoginDiagnosticReason; message: string; suggestions: string[] } {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("username is required")) {
    return { reason: "USERNAME_REQUIRED", message, suggestions: ["Isi username X tanpa @ sebelum test login."] };
  }
  if (lower.includes("cookies are required") || lower.includes("paste cookies")) {
    return { reason: "COOKIE_REQUIRED", message, suggestions: ["Login ke x.com di browser lalu export cookies sebagai JSON.", "Pastikan hasil export ditempel lengkap."] };
  }
  if (lower.includes("cookie json is invalid") || lower.includes("must be an array")) {
    return { reason: "COOKIE_JSON_INVALID", message, suggestions: ["Export ulang cookies dari Cookie-Editor/EditThisCookie sebagai JSON.", "Atau paste raw cookie header: auth_token=...; ct0=..."] };
  }
  if (lower.includes("auth_token")) {
    return { reason: "AUTH_TOKEN_MISSING", message, suggestions: ["Pastikan cookie auth_token ada di export.", "Jangan export dari tab incognito/private yang belum login."] };
  }
  if (lower.includes("ct0")) {
    return { reason: "CT0_MISSING", message, suggestions: ["Pastikan cookie ct0 ada di export.", "Refresh x.com setelah login lalu export ulang cookies."] };
  }
  if (lower.includes("rejected") || lower.includes("expired") || lower.includes("401") || lower.includes("403") || lower.includes("could not authenticate") || lower.includes("page does not exist")) {
    return { reason: lower.includes("bearer") ? "OAUTH_REJECTED" : "COOKIE_EXPIRED", message, suggestions: ["Login ulang ke x.com dan export cookies baru.", "Pastikan export cookies dari domain x.com, bukan twitter.com saja.", "Gunakan browser/profile yang sama dengan akun login.", "Gunakan proxy/IP yang sama negara dengan lokasi login akun.", "Jika akun kena checkpoint, selesaikan verifikasi manual di x.com dulu."] };
  }
  if (lower.includes("not @") || lower.includes("different username")) {
    return { reason: "USERNAME_MISMATCH", message, suggestions: ["Username di form harus sama dengan akun yang cookienya diexport.", "Jika ingin akun lain, login ke x.com dengan akun tersebut lalu export ulang."] };
  }
  if (lower.includes("rate limited") || lower.includes("429")) {
    return { reason: "RATE_LIMITED", message, suggestions: ["Tunggu beberapa menit sebelum test lagi.", "Jangan klik test berulang-ulang.", "Gunakan proxy yang stabil jika sering kena limit."] };
  }
  if (lower.includes("proxy") || lower.includes("tunnel") || lower.includes("socks")) {
    return { reason: "PROXY_ERROR", message, suggestions: ["Cek format proxy: http://user:pass@host:port", "Pastikan proxy aktif dan bisa akses x.com.", "Coba test tanpa proxy untuk memastikan masalahnya."] };
  }
  if (lower.includes("timeout") || lower.includes("aborted")) {
    return { reason: "NETWORK_TIMEOUT", message, suggestions: ["Cek koneksi server ke x.com.", "Coba proxy lain atau ulangi beberapa menit lagi."] };
  }
  if (lower.includes("was not found")) {
    return { reason: "USERNAME_NOT_FOUND", message, suggestions: ["Periksa ejaan username X.", "Pastikan akun tidak suspended atau private dengan pembatasan akses."] };
  }

  return { reason: "UNKNOWN_ERROR", message, suggestions: ["Coba test ulang sekali lagi.", "Jika tetap gagal, cek log backend untuk detail.", "Pastikan akun bisa login manual di x.com."] };
}

async function validateCookieSession(input: AccountInput, expectedUsername: string): Promise<CookieValidationResult> {
  if (!input.cookieJson || !input.cookieJson.trim()) {
    throw new Error("Paste cookies exported from EditThisCookie before saving.");
  }
  const parsed = parseCookieInput(input.cookieJson);
  const verify = await verifyCookieSession({
    authToken: parsed.authToken,
    ct0: parsed.ct0,
    rawHeader: parsed.rawHeader,
    userAgent: input.cookieUserAgent?.trim() || null,
  }, expectedUsername, normalizeProxyUrl(input.proxyUrl));

  return {
    authToken: parsed.authToken,
    ct0: parsed.ct0,
    rawHeader: parsed.rawHeader,
    message: `Cookies validated for @${verify.username}.`,
  };
}

router.get("/", async (_req, res) => {
  const accounts = await db.select().from(accountsTable).orderBy(accountsTable.createdAt);
  res.json(accounts.map(toSafeAccount));
});

router.post("/test", authLimiter, async (req, res) => {
  try {
    const body = CreateAccountBody.parse(req.body) as AccountInput;
    const normalizedBody = normalizeAccountInput(body);
    if (normalizedBody.authMode === "cookies") {
      const result = await validateCookieSession(normalizedBody, normalizedBody.username);
      res.json({ ok: true, message: result.message, proxyChecked: Boolean(normalizedBody.proxyUrl), authMode: "cookies" });
      return;
    }
    const result = await verifyXCredentials(normalizedBody);
    res.json({ ...result, proxyChecked: Boolean(normalizedBody.proxyUrl), authMode: "oauth" });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Failed to validate account credentials.";
    console.warn(`[AccountTest] Failed: ${errMsg}`, { hasUsername: !!req.body?.username, hasCookieJson: !!req.body?.cookieJson, cookieJsonLen: (req.body?.cookieJson || "").length, hasProxy: !!req.body?.proxyUrl });
    res.status(400).json({ error: errMsg });
  }
});

router.post("/test-diagnostic", authLimiter, async (req, res) => {
  try {
    const body = CreateAccountBody.parse(req.body) as AccountInput;
    const normalizedBody = normalizeAccountInput(body);
    if (normalizedBody.authMode === "cookies") {
      const result = await validateCookieSession(normalizedBody, normalizedBody.username);
      return res.json({
        ok: true,
        reason: "OK",
        message: result.message,
        suggestions: ["Cookies valid. Simpan akun atau lanjutkan update cookies."],
        proxyChecked: Boolean(normalizedBody.proxyUrl),
        authMode: "cookies",
      });
    }
    const result = await verifyXCredentials(normalizedBody);
    return res.json({
      ok: true,
      reason: "OK",
      message: result.message,
      suggestions: ["OAuth credentials valid. Simpan akun untuk mulai automation."],
      proxyChecked: Boolean(normalizedBody.proxyUrl),
      authMode: "oauth",
    });
  } catch (error) {
    const diagnostic = diagnoseLoginError(error);
    return res.status(400).json({ ok: false, ...diagnostic });
  }
});

router.post("/", strictLimiter, async (req, res) => {
  try {
    const body = CreateAccountBody.parse(req.body) as AccountInput;
    const normalizedBody = normalizeAccountInput(body);

    let cookieFields: { cookieAuthToken: string; cookieCt0: string; cookieRawHeader: string | null } | null = null;
    if (normalizedBody.authMode === "cookies") {
      const cookies = await validateCookieSession(normalizedBody, normalizedBody.username);
      cookieFields = { cookieAuthToken: cookies.authToken, cookieCt0: cookies.ct0, cookieRawHeader: cookies.rawHeader };
    } else {
      await verifyXCredentials(normalizedBody);
    }

    const insertValues = {
      username: normalizedBody.username,
      authMode: normalizedBody.authMode,
      bearerToken: normalizedBody.authMode === "oauth" ? (normalizedBody.bearerToken ?? "") : "",
      apiKey: normalizedBody.authMode === "oauth" ? (normalizedBody.apiKey ?? "") : "",
      apiSecret: normalizedBody.authMode === "oauth" ? (normalizedBody.apiSecret ?? "") : "",
      accessToken: normalizedBody.authMode === "oauth" ? (normalizedBody.accessToken ?? "") : "",
      accessTokenSecret: normalizedBody.authMode === "oauth" ? (normalizedBody.accessTokenSecret ?? "") : "",
      cookieAuthToken: cookieFields?.cookieAuthToken ?? null,
      cookieCt0: cookieFields?.cookieCt0 ?? null,
      cookieRawHeader: cookieFields?.cookieRawHeader ?? null,
      cookieUserAgent: normalizedBody.cookieUserAgent ?? null,
      proxyUrl: normalizedBody.proxyUrl,
      isActive: true,
      postsCount: 0,
    };
    const [account] = await db.insert(accountsTable).values(insertValues).returning();
    res.status(201).json(toSafeAccount(account));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to add account." });
  }
});

router.get("/:id", async (req, res) => {
  const { id } = GetAccountParams.parse({ id: Number(req.params.id) });
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
  if (!account) return res.status(404).json({ error: "Not found" });
  res.json(toSafeAccount(account));
});

router.put("/:id", strictLimiter, async (req, res) => {
  try {
    const { id } = UpdateAccountParams.parse({ id: Number(req.params.id) });
    const body = UpdateAccountBody.parse(req.body) as AccountInput;
    const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const newAuthMode = body.authMode ?? (existing.authMode as "oauth" | "cookies");
    const normalizedBody = normalizeAccountInput({ ...body, authMode: newAuthMode });

    const update: Record<string, unknown> = {
      username: normalizedBody.username,
      authMode: newAuthMode,
    };

    // Only update proxy if frontend sent the field (allow null/empty to clear)
    if (typeof body.proxyUrl !== "undefined") {
      update.proxyUrl = normalizedBody.proxyUrl;
    }

    if (typeof body.cookieUserAgent !== "undefined") {
      update.cookieUserAgent = normalizedBody.cookieUserAgent;
    }

    if (newAuthMode === "oauth") {
      const providedCredentialFields = getProvidedCredentialFields(body);
      if (providedCredentialFields.length > 0 && providedCredentialFields.length !== credentialFields.length) {
        return res.status(400).json({ error: "To replace credentials, enter all credential fields." });
      }
      if (providedCredentialFields.length === credentialFields.length) {
        await verifyXCredentials(normalizedBody);
        for (const field of credentialFields) {
          update[field] = normalizedBody[field];
        }
      }
      if (existing.authMode !== "oauth") {
        if (providedCredentialFields.length !== credentialFields.length) {
          return res.status(400).json({ error: "Switching to API mode requires entering all credential fields." });
        }
        update.cookieAuthToken = null;
        update.cookieCt0 = null;
        update.cookieRawHeader = null;
      }
    } else {
      if (body.cookieJson?.trim()) {
        const cookies = await validateCookieSession(normalizedBody, normalizedBody.username);
        update.cookieAuthToken = cookies.authToken;
        update.cookieCt0 = cookies.ct0;
        update.cookieRawHeader = cookies.rawHeader;
      } else if (existing.authMode !== "cookies" || !existing.cookieAuthToken || !existing.cookieCt0) {
        return res.status(400).json({ error: "Switching to Cookies mode requires pasting EditThisCookie JSON." });
      }
    }

    const [account] = await db.update(accountsTable).set(update).where(eq(accountsTable.id, id)).returning();
    if (!account) return res.status(404).json({ error: "Not found" });
    res.json(toSafeAccount(account));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to update account." });
  }
});

router.post("/:id/cookies", strictLimiter, async (req, res) => {
  try {
    const { id } = UpdateAccountParams.parse({ id: Number(req.params.id) });
    
    let body: AccountInput;
    try {
      body = UpdateAccountBody.parse(req.body) as AccountInput;
    } catch (parseError) {
      const msg = parseError instanceof Error ? parseError.message : "Invalid request body";
      return res.status(400).json({ ok: false, reason: "VALIDATION_ERROR", message: msg, suggestions: ["Cek format cookie JSON dan proxy URL."] });
    }

    const [existing] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
    if (!existing) return res.status(404).json({ ok: false, reason: "NOT_FOUND", message: "Account not found." });

    let normalizedBody: ReturnType<typeof normalizeAccountInput>;
    try {
      normalizedBody = normalizeAccountInput({
        ...body,
        username: body.username ?? existing.username,
        authMode: "cookies",
        proxyUrl: typeof body.proxyUrl === "undefined" ? existing.proxyUrl : body.proxyUrl,
      });
    } catch (normError) {
      const msg = normError instanceof Error ? normError.message : "Invalid input";
      return res.status(400).json({ ok: false, reason: "PROXY_ERROR", message: msg, suggestions: ["Cek format proxy: http://user:pass@host:port", "Pastikan setiap baris proxy valid."] });
    }

    const cookies = await validateCookieSession(normalizedBody, normalizedBody.username);

    const [account] = await db.update(accountsTable).set({
      username: normalizedBody.username,
      authMode: "cookies",
      cookieAuthToken: cookies.authToken,
      cookieCt0: cookies.ct0,
      cookieRawHeader: cookies.rawHeader,
      cookieUserAgent: normalizedBody.cookieUserAgent,
      proxyUrl: normalizedBody.proxyUrl,
      isActive: true,
    }).where(eq(accountsTable.id, id)).returning();

    return res.json({ ok: true, message: cookies.message, account: toSafeAccount(account) });
  } catch (error) {
    const diagnostic = diagnoseLoginError(error);
    return res.status(400).json({ ok: false, ...diagnostic });
  }
});

router.delete("/:id", strictLimiter, async (req, res) => {
  const { id } = DeleteAccountParams.parse({ id: Number(req.params.id) });
  await db.delete(accountsTable).where(eq(accountsTable.id, id));
  res.json({ ok: true });
});

router.get("/:id/health", async (req, res) => {
  const { id } = GetAccountParams.parse({ id: Number(req.params.id) });
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, id));
  if (!account) return res.status(404).json({ error: "Not found" });

  if (account.authMode === "cookies") {
    const result = await checkCookieHealth(account);
    return res.json({ status: result.status, message: result.message, rateLimit: null, authMode: "cookies" });
  }

  const bearerToken = account.bearerToken?.trim();
  if (!bearerToken) {
    return res.json({ status: "error", message: "No Bearer Token configured.", rateLimit: null, authMode: "oauth" });
  }

  const urls = [
    `https://api.x.com/2/users/by/username/${encodeURIComponent(account.username)}?user.fields=id,username`,
    `https://api.twitter.com/2/users/by/username/${encodeURIComponent(account.username)}?user.fields=id,username`,
  ];

  for (const url of urls) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${bearerToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      continue;
    }

    const rateLimit = {
      limit: response.headers.get("x-rate-limit-limit"),
      remaining: response.headers.get("x-rate-limit-remaining"),
      reset: response.headers.get("x-rate-limit-reset"),
    };

    if (response.status === 401 || response.status === 403) {
      return res.json({ status: "expired", message: "Bearer Token is invalid or expired.", rateLimit, authMode: "oauth" });
    }

    if (response.status === 429) {
      const resetAt = rateLimit.reset ? new Date(parseInt(rateLimit.reset) * 1000).toISOString() : null;
      return res.json({ status: "rate_limited", message: `Rate limited. Resets at ${resetAt ?? "unknown"}.`, rateLimit, authMode: "oauth" });
    }

    if (response.ok) {
      const payload = await response.json().catch(() => null) as { data?: { username?: string } } | null;
      const verifiedUsername = payload?.data?.username ?? account.username;
      return res.json({
        status: "ok",
        message: `Account @${verifiedUsername} is active and healthy.`,
        rateLimit,
        authMode: "oauth",
      });
    }
  }

  return res.json({ status: "error", message: "Unable to reach X API.", rateLimit: null, authMode: "oauth" });
});

// POST /api/accounts/check-proxies — Test proxy list latency
router.post("/check-proxies", async (req, res) => {
  const { proxies } = req.body as { proxies?: string };
  if (!proxies?.trim()) return res.status(400).json({ error: "No proxies provided." });

  const lines = proxies.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
  const results: Array<{ proxy: string; status: "alive" | "dead" | "timeout"; latency: number | null; ip?: string; error?: string }> = [];

  for (const proxy of lines.slice(0, 20)) { // Max 20 proxies at once
    const start = Date.now();
    try {
      const { ProxyAgent, fetch: undiciFetch } = await import("undici");
      const dispatcher = new ProxyAgent(proxy);
      const response = await undiciFetch("https://api.ipify.org?format=json", {
        dispatcher,
        signal: AbortSignal.timeout(10_000),
      } as any) as unknown as Response;

      const latency = Date.now() - start;
      if (response.ok) {
        const data = await response.json() as { ip?: string };
        results.push({ proxy, status: "alive", latency, ip: (data as any)?.ip });
      } else {
        results.push({ proxy, status: "dead", latency, error: `HTTP ${response.status}` });
      }
    } catch (error) {
      const latency = Date.now() - start;
      const msg = error instanceof Error ? error.message : String(error);
      results.push({
        proxy,
        status: msg.includes("timeout") || msg.includes("abort") ? "timeout" : "dead",
        latency: msg.includes("timeout") ? null : latency,
        error: msg.slice(0, 100),
      });
    }
  }

  return res.json({ ok: true, results });
});

export default router;
