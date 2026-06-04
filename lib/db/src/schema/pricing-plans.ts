import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const pricingPlansTable = pgTable("pricing_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: text("price").notNull(),
  period: text("period").notNull().default("/bulan"),
  description: text("description"),
  features: text("features").notNull().default(""),
  ctaText: text("cta_text").notNull().default("Mulai Sekarang"),
  isPopular: boolean("is_popular").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PricingPlan = typeof pricingPlansTable.$inferSelect;
