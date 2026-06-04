import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const adsTable = pgTable("ads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  targetUrl: text("target_url").notNull(),
  imageUrl: text("image_url"),
  buttonText: text("button_text").notNull().default("Visit Now"),
  bgColor: text("bg_color").notNull().default("#00e5ff"),
  textColor: text("text_color").notNull().default("#000000"),
  domains: text("domains"),
  showDelaySec: integer("show_delay_sec").notNull().default(3),
  closeDelaySec: integer("close_delay_sec").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Ad = typeof adsTable.$inferSelect;
