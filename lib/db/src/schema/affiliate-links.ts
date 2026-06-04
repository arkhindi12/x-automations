import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const affiliateLinksTable = pgTable("affiliate_links", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  destinationUrl: text("destination_url").notNull(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(true),
  clicks: integer("clicks").notNull().default(0),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAffiliateLinkSchema = createInsertSchema(affiliateLinksTable).omit({ id: true, createdAt: true, clicks: true });
export type InsertAffiliateLink = z.infer<typeof insertAffiliateLinkSchema>;
export type AffiliateLink = typeof affiliateLinksTable.$inferSelect;
