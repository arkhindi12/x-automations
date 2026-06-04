import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";

export const mediaTable = pgTable("media", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobsTable.id),
  targetUsername: text("target_username").notNull(),
  type: text("type").notNull(),
  originalUrl: text("original_url").notNull(),
  sourceTweetId: text("source_tweet_id"),
  sourceText: text("source_text"),
  localPath: text("local_path"),
  doodUrl: text("dood_url"),
  doodStatus: text("dood_status"),
  streamtapeUrl: text("streamtape_url"),
  thumbnailUrl: text("thumbnail_url"),
  mirrorUrl: text("mirror_url"),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMediaSchema = createInsertSchema(mediaTable).omit({ id: true, createdAt: true });
export type InsertMedia = z.infer<typeof insertMediaSchema>;
export type Media = typeof mediaTable.$inferSelect;
