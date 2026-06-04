import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const extractorProfilesTable = pgTable("extractor_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domainPattern: text("domain_pattern").notNull(),
  urlPattern: text("url_pattern"),
  method: text("method").notNull().default("html"),
  config: text("config").notNull().default("{}"),
  customUa: text("custom_ua"),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  successCount: integer("success_count").notNull().default(0),
  failCount: integer("fail_count").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertExtractorProfileSchema = createInsertSchema(extractorProfilesTable).omit({
  id: true,
  successCount: true,
  failCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertExtractorProfile = z.infer<typeof insertExtractorProfileSchema>;
export type ExtractorProfile = typeof extractorProfilesTable.$inferSelect;
