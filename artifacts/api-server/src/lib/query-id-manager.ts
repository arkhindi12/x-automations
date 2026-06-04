/**
 * X/Twitter Query ID Manager
 * Handles dynamic query IDs with fallback mechanism
 */

import { logger } from "./logger";

interface QueryIdConfig {
  id: string;
  lastUpdated: Date;
  failCount: number;
  alternatives?: string[];
}

// Current query IDs (these may change over time)
const queryIds = new Map<string, QueryIdConfig>([
  ["UserByScreenName", {
    id: "G3KGOASz96M-Qu0nwmGXNg",
    lastUpdated: new Date(),
    failCount: 0,
    alternatives: [],
  }],
  ["UserTweets", {
    id: "E3opETHurmVJflFsUBVuUQ",
    lastUpdated: new Date(),
    failCount: 0,
    alternatives: [],
  }],
  ["HomeLatestTimeline", {
    id: "zhX91JE87mWvfprhYE97xA",
    lastUpdated: new Date(),
    failCount: 0,
    alternatives: [],
  }],
  ["HomeTimeline", {
    id: "k5XapwcSikNsEsILW5FvgA",
    lastUpdated: new Date(),
    failCount: 0,
    alternatives: [],
  }],
  ["CreateTweet", {
    id: "I_J3_LvnnihD0Gjbq5pD2g",
    lastUpdated: new Date(),
    failCount: 0,
    alternatives: [],
  }],
  ["Viewer", {
    id: "okNaf-6AQWu2DD2H_MAoVw",
    lastUpdated: new Date(),
    failCount: 0,
    alternatives: [],
  }],
]);

/**
 * Get query ID for operation
 */
export function getQueryId(operation: string): string {
  const config = queryIds.get(operation);
  if (!config) {
    throw new Error(`Unknown query operation: ${operation}`);
  }
  return config.id;
}

/**
 * Report query ID failure
 */
export function reportQueryIdFailure(operation: string, error: string) {
  const config = queryIds.get(operation);
  if (!config) return;

  config.failCount++;
  
  logger.warn({
    operation,
    queryId: config.id,
    failCount: config.failCount,
    error,
  }, "Query ID failure reported");

  // If fails too many times, might need update
  if (config.failCount > 10) {
    logger.error({
      operation,
      queryId: config.id,
      failCount: config.failCount,
    }, "Query ID may be outdated - needs manual update");
  }
}

/**
 * Update query ID for operation
 */
export function updateQueryId(operation: string, newId: string) {
  const config = queryIds.get(operation);
  if (!config) {
    queryIds.set(operation, {
      id: newId,
      lastUpdated: new Date(),
      failCount: 0,
      alternatives: [],
    });
  } else {
    // Save old ID as alternative
    if (config.id !== newId && !config.alternatives?.includes(config.id)) {
      config.alternatives = [...(config.alternatives || []), config.id];
    }
    config.id = newId;
    config.lastUpdated = new Date();
    config.failCount = 0;
  }

  logger.info({
    operation,
    newId,
    oldId: config?.id,
  }, "Query ID updated");
}

/**
 * Try alternative query ID
 */
export function tryAlternativeQueryId(operation: string): string | null {
  const config = queryIds.get(operation);
  if (!config || !config.alternatives || config.alternatives.length === 0) {
    return null;
  }

  // Try first alternative
  const alternative = config.alternatives[0];
  logger.info({
    operation,
    currentId: config.id,
    alternativeId: alternative,
  }, "Trying alternative query ID");

  return alternative;
}

/**
 * Get query ID status
 */
export function getQueryIdStatus() {
  const status: Record<string, {
    id: string;
    failCount: number;
    lastUpdated: string;
    hasAlternatives: boolean;
  }> = {};

  for (const [operation, config] of queryIds.entries()) {
    status[operation] = {
      id: config.id,
      failCount: config.failCount,
      lastUpdated: config.lastUpdated.toISOString(),
      hasAlternatives: (config.alternatives?.length || 0) > 0,
    };
  }

  return status;
}

/**
 * Reset fail counts
 */
export function resetFailCounts() {
  for (const config of queryIds.values()) {
    config.failCount = 0;
  }
  logger.info("Query ID fail counts reset");
}

/**
 * Check if query IDs need update
 */
export function needsQueryIdUpdate(): Array<{ operation: string; failCount: number }> {
  const needsUpdate: Array<{ operation: string; failCount: number }> = [];

  for (const [operation, config] of queryIds.entries()) {
    if (config.failCount > 5) {
      needsUpdate.push({ operation, failCount: config.failCount });
    }
  }

  return needsUpdate;
}
