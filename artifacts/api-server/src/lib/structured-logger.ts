/**
 * Structured logging utilities for critical operations
 * Extends base logger with domain-specific logging functions
 */

import { logger as baseLogger } from "./logger";

export const logger = baseLogger;

/**
 * Log account-related operations
 */
export const accountLogger = {
  created: (accountId: number, username: string, authMode: string) => {
    logger.info(
      { accountId, username, authMode },
      `Account created: @${username} (${authMode})`
    );
  },

  updated: (accountId: number, username: string, fields: string[]) => {
    logger.info(
      { accountId, username, updatedFields: fields },
      `Account updated: @${username}`
    );
  },

  deleted: (accountId: number, username: string) => {
    logger.warn(
      { accountId, username },
      `Account deleted: @${username}`
    );
  },

  healthCheckFailed: (accountId: number, username: string, error: string, expired: boolean) => {
    logger.warn(
      { accountId, username, error, expired },
      `Account health check failed: @${username}`
    );
  },

  healthCheckPassed: (accountId: number, username: string) => {
    logger.info(
      { accountId, username },
      `Account health check passed: @${username}`
    );
  },

  credentialsExpired: (accountId: number, username: string) => {
    logger.error(
      { accountId, username },
      `Account credentials expired: @${username}`
    );
  },
};

/**
 * Log job-related operations
 */
export const jobLogger = {
  created: (jobId: number, accountId: number, targetId: number) => {
    logger.info(
      { jobId, accountId, targetId },
      `Job created: #${jobId}`
    );
  },

  started: (jobId: number, accountId: number) => {
    logger.info(
      { jobId, accountId },
      `Job started: #${jobId}`
    );
  },

  completed: (jobId: number, duration: number, mediaCount: number) => {
    logger.info(
      { jobId, duration, mediaCount },
      `Job completed: #${jobId} (${duration}ms, ${mediaCount} media)`
    );
  },

  failed: (jobId: number, error: string, duration: number) => {
    logger.error(
      { jobId, error, duration },
      `Job failed: #${jobId} - ${error}`
    );
  },

  mediaExtracted: (jobId: number, mediaId: number, type: string, url: string) => {
    logger.debug(
      { jobId, mediaId, type, url: url.substring(0, 100) },
      `Media extracted: #${mediaId} (${type})`
    );
  },

  scheduledRun: (jobId: number, nextRun: Date) => {
    logger.info(
      { jobId, nextRun },
      `Job scheduled: #${jobId} next run at ${nextRun.toISOString()}`
    );
  },
};

/**
 * Log post publishing operations
 */
export const postLogger = {
  scheduled: (postId: number, accountId: number, scheduledAt: Date) => {
    logger.info(
      { postId, accountId, scheduledAt },
      `Post scheduled: #${postId} at ${scheduledAt.toISOString()}`
    );
  },

  publishing: (postId: number, accountId: number, username: string) => {
    logger.info(
      { postId, accountId, username },
      `Publishing post: #${postId} to @${username}`
    );
  },

  published: (postId: number, accountId: number, username: string, xPostId: string) => {
    logger.info(
      { postId, accountId, username, xPostId },
      `Post published: #${postId} to @${username} (X ID: ${xPostId})`
    );
  },

  failed: (postId: number, accountId: number, username: string, error: string) => {
    logger.error(
      { postId, accountId, username, error },
      `Post publishing failed: #${postId} to @${username} - ${error}`
    );
  },

  mediaUploaded: (postId: number, mediaId: number, xMediaId: string) => {
    logger.debug(
      { postId, mediaId, xMediaId },
      `Media uploaded for post #${postId}: X media ID ${xMediaId}`
    );
  },

  mediaUploadFailed: (postId: number, mediaId: number, error: string) => {
    logger.warn(
      { postId, mediaId, error },
      `Media upload failed for post #${postId}: ${error}`
    );
  },
};

/**
 * Log media operations
 */
export const mediaLogger = {
  downloaded: (mediaId: number, url: string, size: number) => {
    logger.debug(
      { mediaId, url: url.substring(0, 100), size },
      `Media downloaded: #${mediaId} (${(size / 1024 / 1024).toFixed(2)} MB)`
    );
  },

  downloadFailed: (mediaId: number, url: string, error: string) => {
    logger.error(
      { mediaId, url: url.substring(0, 100), error },
      `Media download failed: #${mediaId} - ${error}`
    );
  },

  watermarkApplied: (mediaId: number, type: string) => {
    logger.debug(
      { mediaId, type },
      `Watermark applied to media #${mediaId} (${type})`
    );
  },

  watermarkFailed: (mediaId: number, error: string) => {
    logger.warn(
      { mediaId, error },
      `Watermark failed for media #${mediaId}: ${error}`
    );
  },
};

/**
 * Log security-related events
 */
export const securityLogger = {
  rateLimitHit: (accountId: number, username: string, endpoint: string) => {
    logger.warn(
      { accountId, username, endpoint },
      `Rate limit hit for @${username} on ${endpoint}`
    );
  },

  suspiciousActivity: (accountId: number, username: string, activity: string) => {
    logger.warn(
      { accountId, username, activity },
      `Suspicious activity detected for @${username}: ${activity}`
    );
  },

  authenticationFailed: (username: string, reason: string) => {
    logger.warn(
      { username, reason },
      `Authentication failed for @${username}: ${reason}`
    );
  },

  proxyError: (proxyUrl: string, error: string) => {
    logger.error(
      { proxyUrl: proxyUrl.substring(0, 50), error },
      `Proxy error: ${error}`
    );
  },
};

/**
 * Log system operations
 */
export const systemLogger = {
  schedulerStarted: () => {
    logger.info("Automation scheduler started");
  },

  schedulerTick: (jobsChecked: number, postsChecked: number) => {
    logger.debug(
      { jobsChecked, postsChecked },
      `Scheduler tick: checked ${jobsChecked} jobs, ${postsChecked} posts`
    );
  },

  databaseConnected: () => {
    logger.info("Database connection established");
  },

  databaseError: (error: string) => {
    logger.error({ error }, `Database error: ${error}`);
  },

  serverStarted: (port: number, env: string) => {
    logger.info(
      { port, env },
      `Server started on port ${port} (${env})`
    );
  },

  serverShutdown: (reason: string) => {
    logger.warn({ reason }, `Server shutting down: ${reason}`);
  },
};

/**
 * Log API request errors
 */
export const apiLogger = {
  requestError: (method: string, path: string, statusCode: number, error: string) => {
    logger.error(
      { method, path, statusCode, error },
      `API error: ${method} ${path} - ${statusCode} - ${error}`
    );
  },

  validationError: (path: string, errors: unknown) => {
    logger.warn(
      { path, errors },
      `Validation error on ${path}`
    );
  },

  slowRequest: (method: string, path: string, duration: number) => {
    logger.warn(
      { method, path, duration },
      `Slow request: ${method} ${path} took ${duration}ms`
    );
  },
};
