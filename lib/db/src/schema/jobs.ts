import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accountsTable } from "./accounts";
import { targetsTable } from "./targets";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  accountId: integer("account_id").notNull().references(() => accountsTable.id),
  targetId: integer("target_id").references(() => targetsTable.id),
  mediaSource: text("media_source").notNull().default("grab"),
  savedMediaId: integer("saved_media_id"),
  scheduleType: text("schedule_type").notNull().default("interval"),
  scheduleValue: text("schedule_value").notNull().default("60"),
  grabImages: boolean("grab_images").notNull().default(true),
  grabVideos: boolean("grab_videos").notNull().default(true),
  includeReplies: boolean("include_replies").notNull().default(false),
  extractLinksFromReplies: boolean("extract_links_from_replies").notNull().default(false),
  allowedVideoDomains: text("allowed_video_domains"),
  keywordFilter: text("keyword_filter"),
  grabExternalLinksOnly: boolean("grab_external_links_only").default(false),
  uploadToDood: boolean("upload_to_dood").notNull().default(false),
  autoEmbed: boolean("auto_embed").notNull().default(false),
  doodApiKey: text("dood_api_key"),
  postToX: boolean("post_to_x").notNull().default(false),
  postTemplate: text("post_template"),
  insertLink: text("insert_link"),
  isActive: boolean("is_active").notNull().default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  runsCount: integer("runs_count").notNull().default(0),
  status: text("status").notNull().default("idle"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  proxyList: text("proxy_list"),
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  aiProvider: text("ai_provider").notNull().default("openai"),
  aiApiKey: text("ai_api_key"),
  aiPrompt: text("ai_prompt"),
  repostEnabled: boolean("repost_enabled").notNull().default(false),
  primeTimeHours: text("prime_time_hours"),
  repostTargetAccountId: integer("repost_target_account_id").references(() => accountsTable.id),
  watermarkEnabled: boolean("watermark_enabled").notNull().default(false),
  watermarkType: text("watermark_type").notNull().default("text"),
  watermarkText: text("watermark_text"),
  watermarkFontSize: integer("watermark_font_size").notNull().default(24),
  watermarkFontWeight: text("watermark_font_weight").notNull().default("bold"),
  watermarkColor: text("watermark_color").notNull().default("#ffffff"),
  watermarkOpacity: real("watermark_opacity").notNull().default(0.8),
  watermarkPosition: text("watermark_position").notNull().default("bottom-right"),
  watermarkLogoUrl: text("watermark_logo_url"),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, runsCount: true, lastRun: true, nextRun: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
