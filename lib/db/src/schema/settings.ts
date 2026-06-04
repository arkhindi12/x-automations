import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  nineproxyApiKey: text("nineproxy_api_key"),
  nineproxyGateway: text("nineproxy_gateway"),
  embedDomain: text("embed_domain"),
  embedDomains: text("embed_domains"),
  doodstreamApiKey: text("doodstream_api_key"),
  streamtapeLogin: text("streamtape_login"),
  streamtapeKey: text("streamtape_key"),
  followRepostSource: boolean("follow_repost_source").default(true),
  blockedDomains: text("blocked_domains"),
  timezone: text("timezone").default("Asia/Jakarta"),
  // SEO Settings
  siteName: text("site_name"),
  siteTitle: text("site_title"),
  siteDescription: text("site_description"),
  siteKeywords: text("site_keywords"),
  ogImage: text("og_image"),
  faviconUrl: text("favicon_url"),
  twitterCard: text("twitter_card"),
  twitterSite: text("twitter_site"),
  googleAnalyticsId: text("google_analytics_id"),
  googleTagManagerId: text("google_tag_manager_id"),
  metaPixelId: text("meta_pixel_id"),
  customHeadHtml: text("custom_head_html"),
  robotsIndex: text("robots_index"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Settings = typeof settingsTable.$inferSelect;