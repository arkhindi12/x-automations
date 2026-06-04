import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const embedsTable = pgTable("embeds", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title"),
  doodUrl: text("dood_url").notNull(),
  customLink: text("custom_link").notNull(),
  popupDelay: integer("popup_delay").notNull().default(0),
  popupInterval: integer("popup_interval").notNull().default(180),
  popupOnClick: integer("popup_on_click").notNull().default(1),
  views: integer("views").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEmbedSchema = createInsertSchema(embedsTable).omit({ id: true, createdAt: true, views: true, clicks: true });
export type InsertEmbed = z.infer<typeof insertEmbedSchema>;
export type Embed = typeof embedsTable.$inferSelect;
