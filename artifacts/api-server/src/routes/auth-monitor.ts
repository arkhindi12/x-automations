import { Router } from "express";
import {
  getSessionHealth,
  getSessionsNeedingAttention,
  clearSessionCache,
  batchHealthCheck,
} from "../lib/auth-enhancer";
import { getQueryIdStatus, needsQueryIdUpdate, resetFailCounts } from "../lib/query-id-manager";
import { getProxyStats, resetProxyStats } from "../lib/proxy-manager";
import { checkCookieHealth } from "../lib/x-web-client";
import { db } from "@workspace/db";
import { accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

/**
 * GET /api/auth-monitor/sessions
 * Get all session health status
 */
router.get("/sessions", async (req, res) => {
  const sessionsNeedingAttention = getSessionsNeedingAttention();
  
  res.json({
    total: sessionsNeedingAttention.length,
    sessions: sessionsNeedingAttention.map(s => ({
      accountId: s.accountId,
      isValid: s.health.isValid,
      needsRefresh: s.health.needsRefresh,
      errorCount: s.health.errorCount,
      lastChecked: s.health.lastChecked,
      expiresIn: s.health.expiresIn,
    })),
  });
});

/**
 * GET /api/auth-monitor/sessions/:accountId
 * Get specific session health
 */
router.get("/sessions/:accountId", (req, res) => {
  const accountId = parseInt(req.params.accountId);
  const health = getSessionHealth(accountId);

  if (!health) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json({
    accountId,
    ...health,
  });
});

/**
 * POST /api/auth-monitor/sessions/check
 * Run batch health check
 */
router.post("/sessions/check", async (req, res) => {
  try {
    const result = await batchHealthCheck(async (accountId) => {
      const [account] = await db
        .select()
        .from(accountsTable)
        .where(eq(accountsTable.id, accountId));

      if (account && account.authMode === "cookies") {
        await checkCookieHealth({
          cookieAuthToken: account.cookieAuthToken!,
          cookieCt0: account.cookieCt0!,
          cookieRawHeader: account.cookieRawHeader,
          cookieUserAgent: account.cookieUserAgent,
          proxyUrl: account.proxyUrl,
          username: account.username,
        });
      }
    });

    res.json({
      message: "Batch health check completed",
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Health check failed",
    });
  }
});

/**
 * DELETE /api/auth-monitor/sessions/cache
 * Clear session cache
 */
router.delete("/sessions/cache", (req, res) => {
  const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
  clearSessionCache(accountId);

  res.json({
    message: accountId
      ? `Session cache cleared for account ${accountId}`
      : "All session caches cleared",
  });
});

/**
 * GET /api/auth-monitor/query-ids
 * Get query ID status
 */
router.get("/query-ids", (req, res) => {
  const status = getQueryIdStatus();
  const needsUpdate = needsQueryIdUpdate();

  res.json({
    queryIds: status,
    needsUpdate,
  });
});

/**
 * POST /api/auth-monitor/query-ids/reset
 * Reset query ID fail counts
 */
router.post("/query-ids/reset", (req, res) => {
  resetFailCounts();
  res.json({ message: "Query ID fail counts reset" });
});

/**
 * GET /api/auth-monitor/proxies
 * Get proxy statistics
 */
router.get("/proxies", (req, res) => {
  const stats = getProxyStats();
  res.json(stats);
});

/**
 * POST /api/auth-monitor/proxies/reset
 * Reset proxy statistics
 */
router.post("/proxies/reset", (req, res) => {
  resetProxyStats();
  res.json({ message: "Proxy statistics reset" });
});

/**
 * GET /api/auth-monitor/health
 * Overall authentication system health
 */
router.get("/health", async (req, res) => {
  const sessionsNeedingAttention = getSessionsNeedingAttention();
  const queryIdStatus = needsQueryIdUpdate();
  const proxyStats = getProxyStats();

  const health = {
    status: "ok" as "ok" | "warning" | "critical",
    sessions: {
      needingAttention: sessionsNeedingAttention.length,
      status: sessionsNeedingAttention.length === 0 ? "ok" : "warning",
    },
    queryIds: {
      needingUpdate: queryIdStatus.length,
      status: queryIdStatus.length === 0 ? "ok" : queryIdStatus.length > 2 ? "critical" : "warning",
    },
    proxies: {
      total: proxyStats.total,
      healthy: proxyStats.healthy,
      unhealthy: proxyStats.unhealthy,
      status: proxyStats.healthy === 0 && proxyStats.total > 0 ? "critical" : "ok",
    },
  };

  // Determine overall status
  if (
    health.sessions.status === "critical" ||
    health.queryIds.status === "critical" ||
    health.proxies.status === "critical"
  ) {
    health.status = "critical";
  } else if (
    health.sessions.status === "warning" ||
    health.queryIds.status === "warning"
  ) {
    health.status = "warning";
  }

  res.json(health);
});

export default router;
