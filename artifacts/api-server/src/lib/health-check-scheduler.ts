import { db } from "@workspace/db";
import { accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { checkCookieHealth } from "./x-web-client";
import { logger } from "./structured-logger";

let healthCheckStarted = false;

/**
 * Auto health check untuk semua accounts
 * Berjalan setiap 6 jam (bukan 1 jam untuk menghindari suspicious activity)
 * Hanya check, TIDAK auto refresh cookies
 */
async function runHealthCheck() {
  try {
    const accounts = await db.select().from(accountsTable).where(eq(accountsTable.isActive, true));
    
    logger.info({ totalAccounts: accounts.length }, "Running scheduled health check");

    for (const account of accounts) {
      // Skip OAuth accounts, hanya check cookie accounts
      if (account.authMode !== "cookies") continue;
      
      try {
        const cookieAccount = {
          cookieAuthToken: account.cookieAuthToken,
          cookieCt0: account.cookieCt0,
          cookieRawHeader: account.cookieRawHeader,
          cookieUserAgent: account.cookieUserAgent,
          proxyUrl: account.proxyUrl,
          username: account.username,
        };
        
        const health = await checkCookieHealth(cookieAccount);
        
        if (health.status === "expired") {
          logger.warn({ 
            accountId: account.id, 
            username: account.username
          }, "Account cookies expired - manual refresh required");
        } else if (health.status === "ok") {
          logger.info({ 
            accountId: account.id, 
            username: account.username 
          }, "Account health check passed");
        } else {
          logger.error({ 
            accountId: account.id, 
            username: account.username,
            message: health.message 
          }, "Account health check failed");
        }
      } catch (error) {
        logger.error({ 
          accountId: account.id, 
          username: account.username,
          error: error instanceof Error ? error.message : String(error) 
        }, "Health check error");
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Health check scheduler failed");
  }
}

export function startHealthCheckScheduler() {
  if (healthCheckStarted) return;
  healthCheckStarted = true;

  // Run pertama kali setelah 5 menit server start
  setTimeout(() => {
    void runHealthCheck();
  }, 5 * 60 * 1000);

  // Kemudian run setiap 6 jam
  setInterval(() => {
    void runHealthCheck();
  }, 6 * 60 * 60 * 1000);

  logger.info("Health check scheduler started (runs every 6 hours)");
}
