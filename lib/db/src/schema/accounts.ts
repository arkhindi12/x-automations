import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  authMode: text("auth_mode").notNull().default("oauth"),
  bearerToken: text("bearer_token").notNull().default(""),
  apiKey: text("api_key").notNull().default(""),
  apiSecret: text("api_secret").notNull().default(""),
  accessToken: text("access_token").notNull().default(""),
  accessTokenSecret: text("access_token_secret").notNull().default(""),
  cookieAuthToken: text("cookie_auth_token"),
  cookieCt0: text("cookie_ct0"),
  cookieRawHeader: text("cookie_raw_header"),
  cookieUserAgent: text("cookie_user_agent"),
  proxyUrl: text("proxy_url"),
  stickyProxyUrl: text("sticky_proxy_url"),
  fingerprintJson: text("fingerprint_json"),
  healthStatus: text("health_status").notNull().default("unknown"),
  riskScore: integer("risk_score").notNull().default(0),
  lastHealthCheck: timestamp("last_health_check"),
  lastSuccessAt: timestamp("last_success_at"),
  lastError: text("last_error"),
  pausedReason: text("paused_reason"),
  isActive: boolean("is_active").notNull().default(true),
  postsCount: integer("posts_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true, postsCount: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
