import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Ensure critical indexes exist on the media table for dedupe performance.
 * These indexes make per-item duplicate checks fast (< 1ms) instead of
 * requiring a full table scan into memory.
 * 
 * Runs once at startup — CREATE INDEX IF NOT EXISTS is idempotent.
 */
export async function ensureMediaIndexes() {
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_media_original_url ON media (original_url);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_media_source_tweet_id ON media (source_tweet_id) WHERE source_tweet_id IS NOT NULL;
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_media_source_tweet_video ON media (source_tweet_id) WHERE source_tweet_id IS NOT NULL AND type = 'video';
    `);
    logger.info("Media dedupe indexes ensured");
  } catch (error) {
    // Non-fatal — indexes are a performance optimization, not required for correctness
    logger.warn({ err: error }, "Failed to create media indexes (non-fatal)");
  }
}
