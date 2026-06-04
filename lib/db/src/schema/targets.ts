import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const targetsTable = pgTable("targets", {
  id: serial("id").primaryKey(),
  xUsername: text("x_username").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  mediaCount: integer("media_count").notNull().default(0),
  lastChecked: timestamp("last_checked"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTargetSchema = createInsertSchema(targetsTable).omit({ id: true, createdAt: true, mediaCount: true });
export type InsertTarget = z.infer<typeof insertTargetSchema>;
export type Target = typeof targetsTable.$inferSelect;
