/**
 * Enhanced X/Twitter Authentication System
 * Handles cookie expiration, auto-refresh, and better error handling
 */

import { accountsTable } from "@workspace/db";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { accountLogger, securityLogger } from "./structured-logger";

interface SessionHealth {
  isValid: boolean;
  expiresIn?: number; // seconds until expiration
  needsRefresh: boolean;
  lastChecked: Date;
  errorCount: number;
}

interface AuthRetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: AuthRetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

// Session health cache
const sessionHealthCache = new Map<number, SessionHealth>();

// Cookie expiration warning threshold (7 days)
const EXPIRATION_WARNING_THRESHOLD = 7 * 24 * 60 * 60 * 1000;

// Session check interval (1 hour)
const SESSION_CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number, config: AuthRetryConfig): number {
  const delay = Math.min(
    config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelay
  );
  // Add jitter to prevent thundering herd
  return delay + Math.random() * 1000;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: AuthRetryConfig = DEFAULT_RETRY_CONFIG,
  context?: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on authentication errors
      if (error instanceof Error && error.message.includes("expired")) {
        throw error;
      }

      if (attempt < config.maxRetries - 1) {
        const delay = calculateBackoff(attempt, config);
        if (context) {
          securityLogger.suspiciousActivity(
            0,
            context,
            `Retry attempt ${attempt + 1}/${config.maxRetries} after ${delay}ms`
          );
        }
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error("Max retries reached");
}

/**
 * Check if session needs refresh
 */
export function needsSessionRefresh(accountId: number): boolean {
  const health = sessionHealthCache.get(accountId);
  if (!health) return true;

  const timeSinceCheck = Date.now() - health.lastChecked.getTime();
  return timeSinceCheck > SESSION_CHECK_INTERVAL || health.needsRefresh;
}

/**
 * Get session health from cache
 */
export function getSessionHealth(accountId: number): SessionHealth | null {
  return sessionHealthCache.get(accountId) || null;
}

/**
 * Update session health cache
 */
function updateSessionHealth(
  accountId: number,
  isValid: boolean,
  errorCount: number = 0,
  expiresIn?: number
) {
  const needsRefresh = expiresIn ? expiresIn < EXPIRATION_WARNING_THRESHOLD : false;

  sessionHealthCache.set(accountId, {
    isValid,
    expiresIn,
    needsRefresh,
    lastChecked: new Date(),
    errorCount,
  });

  if (needsRefresh && isValid) {
    accountLogger.healthCheckFailed(
      accountId,
      "unknown",
      `Session expires in ${Math.floor(expiresIn! / 1000 / 60 / 60)} hours`,
      false
    );
  }
}

/**
 * Enhanced cookie health check with retry
 */
export async function checkCookieHealthEnhanced(
  accountId: number,
  checkFunction: () => Promise<{ status: "ok" | "expired" | "error"; message: string }>
): Promise<{ status: "ok" | "expired" | "error"; message: string; needsRefresh: boolean }> {
  try {
    const result = await retryWithBackoff(
      checkFunction,
      DEFAULT_RETRY_CONFIG,
      `account-${accountId}`
    );

    if (result.status === "ok") {
      updateSessionHealth(accountId, true, 0);
      accountLogger.healthCheckPassed(accountId, "unknown");
    } else if (result.status === "expired") {
      updateSessionHealth(accountId, false, 0);
      accountLogger.credentialsExpired(accountId, "unknown");
    } else {
      const health = sessionHealthCache.get(accountId);
      const errorCount = (health?.errorCount || 0) + 1;
      updateSessionHealth(accountId, false, errorCount);
    }

    const health = getSessionHealth(accountId);
    return {
      ...result,
      needsRefresh: health?.needsRefresh || false,
    };
  } catch (error) {
    const health = sessionHealthCache.get(accountId);
    const errorCount = (health?.errorCount || 0) + 1;
    updateSessionHealth(accountId, false, errorCount);

    return {
      status: "error",
      message: error instanceof Error ? error.message : "Health check failed",
      needsRefresh: true,
    };
  }
}

/**
 * Auto-refresh session if needed
 */
export async function autoRefreshSession(accountId: number): Promise<boolean> {
  const health = getSessionHealth(accountId);
  if (!health || !health.needsRefresh) {
    return false;
  }

  try {
    // Get account from database
    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId));

    if (!account) {
      return false;
    }

    // Mark account as needing re-authentication
    await db
      .update(accountsTable)
      .set({
        isActive: false,
      })
      .where(eq(accountsTable.id, accountId));

    accountLogger.credentialsExpired(accountId, account.username);
    return true;
  } catch (error) {
    securityLogger.suspiciousActivity(
      accountId,
      "auto-refresh",
      error instanceof Error ? error.message : "Unknown error"
    );
    return false;
  }
}

/**
 * Batch health check for all accounts
 */
export async function batchHealthCheck(
  checkFunction: (accountId: number) => Promise<void>
): Promise<{ checked: number; failed: number; needsRefresh: number }> {
  const accounts = await db.select().from(accountsTable).where(eq(accountsTable.isActive, true));

  let checked = 0;
  let failed = 0;
  let needsRefresh = 0;

  for (const account of accounts) {
    try {
      if (needsSessionRefresh(account.id)) {
        await checkFunction(account.id);
        checked++;

        const health = getSessionHealth(account.id);
        if (health && !health.isValid) {
          failed++;
        }
        if (health && health.needsRefresh) {
          needsRefresh++;
        }
      }
    } catch (error) {
      failed++;
      securityLogger.suspiciousActivity(
        account.id,
        account.username,
        `Batch health check failed: ${error instanceof Error ? error.message : "Unknown"}`
      );
    }
  }

  return { checked, failed, needsRefresh };
}

/**
 * Clear session health cache
 */
export function clearSessionCache(accountId?: number) {
  if (accountId) {
    sessionHealthCache.delete(accountId);
  } else {
    sessionHealthCache.clear();
  }
}

/**
 * Get all sessions that need attention
 */
export function getSessionsNeedingAttention(): Array<{
  accountId: number;
  health: SessionHealth;
}> {
  const result: Array<{ accountId: number; health: SessionHealth }> = [];

  for (const [accountId, health] of sessionHealthCache.entries()) {
    if (!health.isValid || health.needsRefresh || health.errorCount > 2) {
      result.push({ accountId, health });
    }
  }

  return result;
}
