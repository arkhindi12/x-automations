import { accountsTable } from "@workspace/db";
import type {
  XApiError,
  XAccountSettings,
  XGraphQLResponse,
  XTimelineEntry,
  XTweetResult,
  XVideoVariant,
} from "./x-api-types";
import { isXApiError } from "./x-api-types";

type Account = typeof accountsTable.$inferSelect;

const PUBLIC_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const X_WEB_QUERY_IDS = {
  UserByScreenName: "G3KGOASz96M-Qu0nwmGXNg",
  UserTweets: "E3opETHurmVJflFsUBVuUQ",
  HomeLatestTimeline: "zhX91JE87mWvfprhYE97xA",
  HomeTimeline: "k5XapwcSikNsEsILW5FvgA",
  CreateTweet: "I_J3_LvnnihD0Gjbq5pD2g",
  Viewer: "okNaf-6AQWu2DD2H_MAoVw",
  SearchTimeline: "Yw6L66Pw54NHKuq4Dp7b4Q",
  TweetResultByRestId: "2Acdg-VztGlHX7MjX67Ysw",
  TweetDetail: "nBS-WpgA6ZG0CyNHD517JQ",
};

export type CookieAccount = Pick<
  Account,
  "cookieAuthToken" | "cookieCt0" | "cookieRawHeader" | "cookieUserAgent" | "proxyUrl" | "stickyProxyUrl" | "fingerprintJson" | "username"
>;

export type CookieAuthInput = {
  authToken: string;
  ct0: string;
  rawHeader: string | null;
  userAgent: string | null;
};

type EditThisCookieEntry = {
  name?: string;
  value?: string;
  domain?: string;
};

export class CookieAuthError extends Error {
  constructor(message: string, public expired = false) {
    super(message);
    this.name = "CookieAuthError";
  }
}

export function parseCookieInput(input: string): CookieAuthInput {
  const text = input?.trim();
  if (!text) throw new Error("Cookies are required.");

  const cookies = new Map<string, string>();
  let rawHeader: string | null = null;

  if (text.startsWith("[")) {
    let parsed: EditThisCookieEntry[];
    try {
      parsed = JSON.parse(text) as EditThisCookieEntry[];
    } catch {
      throw new Error("Cookie JSON is invalid. Export the cookies again from EditThisCookie.");
    }
    if (!Array.isArray(parsed)) {
      throw new Error("Cookie JSON must be an array exported from EditThisCookie.");
    }
    for (const entry of parsed) {
      const name = entry?.name?.trim();
      const value = entry?.value?.trim();
      if (!name || value == null) continue;
      const domain = entry?.domain ?? "";
      if (domain && !/(^|\.)x\.com$/.test(domain) && !/(^|\.)twitter\.com$/.test(domain)) continue;
      cookies.set(name, value);
    }
    rawHeader = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  } else {
    rawHeader = text.replace(/^cookie:\s*/i, "").trim();
    for (const part of rawHeader.split(/;\s*/)) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (name) cookies.set(name, value);
    }
  }

  const authToken = cookies.get("auth_token");
  const ct0 = cookies.get("ct0");
  if (!authToken) throw new Error("Cookie auth_token was not found in the input.");
  if (!ct0) throw new Error("Cookie ct0 was not found in the input.");

  return { authToken, ct0, rawHeader, userAgent: null };
}

export function buildCookieHeader(account: CookieAccount): string {
  if (account.cookieRawHeader && account.cookieRawHeader.includes("auth_token=")) {
    return account.cookieRawHeader;
  }
  const parts: string[] = [];
  if (account.cookieAuthToken) parts.push(`auth_token=${account.cookieAuthToken}`);
  if (account.cookieCt0) parts.push(`ct0=${account.cookieCt0}`);
  return parts.join("; ");
}

export function maskCookies(account: CookieAccount) {
  return {
    hasCookies: Boolean(account.cookieAuthToken && account.cookieCt0),
    cookieUserAgent: account.cookieUserAgent ?? null,
  };
}

// Sticky proxy: X sessions dislike IP changes. Always use first/sticky proxy, never random per request.
function pickProxy(proxyUrl?: string | null): string | null {
  if (!proxyUrl) return null;
  const proxies = proxyUrl.split(/[\n,]+/).map((p) => p.trim().replace(/\/+$/, "")).filter(Boolean);
  return proxies[0] || null;
}

function getAccountProxy(account: Pick<CookieAccount, "stickyProxyUrl" | "proxyUrl">): string | null {
  return pickProxy(account.stickyProxyUrl || account.proxyUrl || null);
}

async function fetchWithProxy(url: string | URL, options: RequestInit, proxyUrl?: string | null): Promise<Response> {
  const selectedProxy = pickProxy(proxyUrl);
  if (!selectedProxy) return fetch(url, options);
  try {
    const { ProxyAgent, fetch: undiciFetch } = await import("undici");
    const dispatcher = new ProxyAgent(selectedProxy);
    return undiciFetch(url as string, { ...options, dispatcher } as Parameters<typeof undiciFetch>[1]) as unknown as Response;
  } catch (error) {
    // If proxy fails, throw with detail instead of silently falling back
    // This helps diagnose "fetch failed" errors
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT")) {
      throw new Error(`Proxy connection failed (${selectedProxy.replace(/\/\/.*@/, "//***@")}): ${msg}`);
    }
    // For other errors, try without proxy as fallback
    return fetch(url, options);
  }
}

function baseHeaders(account: CookieAccount, extra?: Record<string, string>): Record<string, string> {
  const cookie = buildCookieHeader(account);
  if (!cookie) throw new CookieAuthError("Account has no cookies configured.", true);
  if (!account.cookieCt0) throw new CookieAuthError("Cookie ct0 is missing for this account.", true);

  return {
    Authorization: `Bearer ${PUBLIC_BEARER}`,
    Cookie: cookie,
    "x-csrf-token": account.cookieCt0,
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-client-language": "en",
    "User-Agent": account.cookieUserAgent || DEFAULT_USER_AGENT,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://x.com/",
    Origin: "https://x.com",
    ...extra,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { __rawText: text };
  }
}

function summarizeErrors(payload: unknown, fallback: string): string {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload;
  
  if (isXApiError(payload)) {
    if (payload.errors && Array.isArray(payload.errors) && payload.errors.length > 0) {
      return payload.errors.map((e) => e?.message || e?.detail || JSON.stringify(e)).join("; ");
    }
    if (payload.error) return typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error);
    if (payload.detail) return payload.detail;
  }
  
  return fallback;
}

async function xGraphqlGet(account: CookieAccount, queryId: string, opName: string, variables: object, features?: object): Promise<any> {
  const url = new URL(`https://x.com/i/api/graphql/${queryId}/${opName}`);
  url.searchParams.set("variables", JSON.stringify(variables));
  if (features) url.searchParams.set("features", JSON.stringify(features));

  const response = await fetchWithProxy(url, {
    method: "GET",
    headers: baseHeaders(account),
    signal: AbortSignal.timeout(20000),
  }, getAccountProxy(account));

  const payload = await readJson(response) as any;
  if (response.status === 401 || response.status === 403) {
    throw new CookieAuthError(summarizeErrors(payload, "Cookies were rejected by X (likely expired)."), true);
  }
  if (!response.ok) {
    throw new Error(summarizeErrors(payload, `X graphql ${opName} failed with HTTP ${response.status}`));
  }
  return payload;
}

async function xGraphqlPost(account: CookieAccount, queryId: string, opName: string, body: object): Promise<any> {
  const url = `https://x.com/i/api/graphql/${queryId}/${opName}`;
  const response = await fetchWithProxy(url, {
    method: "POST",
    headers: baseHeaders(account, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  }, getAccountProxy(account));

  const payload = await readJson(response) as any;
  if (response.status === 401 || response.status === 403) {
    throw new CookieAuthError(summarizeErrors(payload, "Cookies were rejected by X (likely expired)."), true);
  }
  if (!response.ok) {
    throw new Error(summarizeErrors(payload, `X graphql ${opName} failed with HTTP ${response.status}`));
  }
  return payload;
}

export async function getUserByScreenName(account: CookieAccount, screenName: string): Promise<any> {
  const variables = {
    screen_name: screenName,
    withSafetyModeUserFields: true,
  };
  return xGraphqlGet(account, X_WEB_QUERY_IDS.UserByScreenName, "UserByScreenName", variables, USER_BY_SCREEN_NAME_FEATURES);
}

export async function verifyCookieSession(input: CookieAuthInput, expectedUsername?: string, proxyUrl?: string | null): Promise<{ username: string }> {
  const account: CookieAccount = {
    cookieAuthToken: input.authToken,
    cookieCt0: input.ct0,
    cookieRawHeader: input.rawHeader,
    cookieUserAgent: input.userAgent,
    proxyUrl: proxyUrl ?? null,
    stickyProxyUrl: proxyUrl ?? null,
    fingerprintJson: null,
    username: expectedUsername ?? "",
  };
  
  // GraphQL endpoint works for current X web sessions.
  // Do not fall through to legacy v1.1 when username is available: that endpoint often returns false 404.
  if (expectedUsername) {
    const userResult = await getUserByScreenName(account, expectedUsername);
    const screenName = userResult?.data?.user?.result?.legacy?.screen_name as string | undefined;
    if (!screenName) {
      throw new Error("X returned no username for these cookies. The session is likely invalid.");
    }
    if (screenName.toLowerCase() !== expectedUsername.toLowerCase()) {
      throw new Error(`Cookies belong to @${screenName}, not @${expectedUsername}.`);
    }
    return { username: screenName };
  }
  
  // Fallback to API v1.1 only when no expected username is available.
  const url = "https://api.x.com/1.1/account/settings.json?include_ext_sharing_audiospaces_listening_data_with_followers=true";
  const response = await fetchWithProxy(url, {
    method: "GET",
    headers: baseHeaders(account),
    signal: AbortSignal.timeout(15000),
  }, proxyUrl);

  const payload = await readJson(response) as XAccountSettings;
  if (response.status === 401 || response.status === 403) {
    throw new CookieAuthError(summarizeErrors(payload, "Cookies were rejected by X. Re-export them after logging in."), true);
  }
  if (!response.ok) {
    throw new Error(summarizeErrors(payload, `Cookie verification failed with HTTP ${response.status}`));
  }

  const screenName = payload?.screen_name as string | undefined;
  if (!screenName) {
    throw new Error("X returned no screen_name for these cookies. The session is likely invalid.");
  }
  if (expectedUsername && screenName.toLowerCase() !== expectedUsername.toLowerCase()) {
    throw new Error(`Cookies belong to @${screenName}, not @${expectedUsername}.`);
  }
  return { username: screenName };
}

export async function checkCookieHealth(account: CookieAccount): Promise<{ status: "ok" | "expired" | "error"; message: string }> {
  try {
    const result = await verifyCookieSession({
      authToken: account.cookieAuthToken!,
      ct0: account.cookieCt0!,
      rawHeader: account.cookieRawHeader,
      userAgent: account.cookieUserAgent,
    }, account.username, account.proxyUrl);
    return { status: "ok", message: `Cookies for @${result.username} are valid.` };
  } catch (error) {
    if (error instanceof CookieAuthError) {
      return { status: "expired", message: error.message };
    }
    return { status: "error", message: error instanceof Error ? error.message : "Cookie health check failed." };
  }
}

const USER_BY_SCREEN_NAME_FEATURES = {
  hidden_profile_likes_enabled: true,
  hidden_profile_subscriptions_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
};

const TIMELINE_FEATURES = {
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

const CREATE_TWEET_FEATURES = {
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  rweb_video_timestamps_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

export type WebTimelineMedia = {
  type: "image" | "video";
  originalUrl: string;
  thumbnailUrl: string | null;
  sourceTweetId: string;
  sourceText: string | null;
  targetUsername: string;
  extraVideoUrls: string[];
};

function pickEntries(payload: any, opName: string): any[] {
  const instructions =
    payload?.data?.user?.result?.timeline_v2?.timeline?.instructions ??
    payload?.data?.user?.result?.timeline?.timeline?.instructions ??
    payload?.data?.home?.home_timeline_urt?.instructions ??
    payload?.data?.home_timeline_urt?.instructions ??
    [];
  const entries: any[] = [];
  for (const ins of instructions) {
    if (ins?.type === "TimelineAddEntries" || ins?.type === "TimelinePinEntry") {
      const list = ins.entries ?? (ins.entry ? [ins.entry] : []);
      entries.push(...list);
    }
  }
  if (entries.length === 0 && opName) {
    // Empty but valid response — return empty array silently.
  }
  return entries;
}

function extractTweetFromEntry(entry: any): { tweet: any; user: any } | null {
  const itemContent = entry?.content?.itemContent;
  if (!itemContent) return null;
  const result = itemContent?.tweet_results?.result;
  if (!result) return null;
  const tweet = result.tweet ?? result;
  const user = tweet?.core?.user_results?.result ?? null;
  return { tweet, user };
}

function getUserScreenName(user: any, fallback = "") {
  return user?.core?.screen_name ?? user?.legacy?.screen_name ?? fallback;
}

function getRepostedTweet(tweet: any): { tweet: any; user: any } | null {
  const result = tweet?.legacy?.retweeted_status_result?.result;
  const original = result?.tweet ?? result;
  if (!original?.legacy) return null;
  const user = original?.core?.user_results?.result ?? null;
  return { tweet: original, user };
}

function tweetMediaItems(tweet: any, fallbackUsername: string, sourceText: string | null): WebTimelineMedia[] {
  const legacy = tweet?.legacy ?? tweet;
  const mediaList = legacy?.entities?.media ?? legacy?.extended_entities?.media ?? [];
  const items: WebTimelineMedia[] = [];

  for (const media of mediaList) {
    const sourceTweetId = (legacy as any)?.id_str ?? (legacy as any)?.rest_id ?? "";
    const previewUrl: string | null = media?.media_url_https ?? media?.preview_image_url ?? null;
    if (media?.type === "photo" && media?.media_url_https) {
      items.push({
        type: "image",
        originalUrl: media.media_url_https,
        thumbnailUrl: media.media_url_https,
        sourceTweetId,
        sourceText,
        targetUsername: fallbackUsername,
        extraVideoUrls: [],
      });
    } else if ((media?.type === "video" || media?.type === "animated_gif") && media?.video_info?.variants) {
      const variants = (media.video_info.variants as XVideoVariant[])
        .filter((v) => v?.content_type === "video/mp4" && !!v?.url)
        .sort((a, b) => (b?.bitrate ?? 0) - (a?.bitrate ?? 0));
      const best = variants[0];
      if (best?.url) {
        items.push({
          type: "video",
          originalUrl: best.url,
          thumbnailUrl: previewUrl,
          sourceTweetId,
          sourceText,
          targetUsername: fallbackUsername,
          extraVideoUrls: [],
        });
      }
    }
  }
  return items;
}

function extractTweetUrls(tweet: any): string[] {
  const legacy = tweet?.legacy ?? tweet;
  const urls: string[] = [];
  for (const ent of legacy?.entities?.urls ?? []) {
    if (ent?.expanded_url) urls.push(ent.expanded_url as string);
    else if (ent?.unwound_url) urls.push(ent.unwound_url as string);
    else if (ent?.url) urls.push(ent.url as string);
  }

  const text = (legacy?.full_text ?? legacy?.text ?? "") as string;
  const rawMatches = text.match(/(?:[a-z0-9-]+\.)+[a-z]{2,}\/[\w./?=&%#:+-]+/gi) ?? [];
  for (const raw of rawMatches) {
    urls.push(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  }

  return Array.from(new Set(urls));
}

function legacyTweetText(tweet: any): string | null {
  const legacy = tweet?.legacy ?? tweet;
  return (legacy?.full_text ?? legacy?.text ?? null) as string | null;
}

export async function fetchUserIdByScreenName(account: CookieAccount, screenName: string): Promise<{ id: string; screenName: string } | null> {
  const payload = await xGraphqlGet(
    account,
    X_WEB_QUERY_IDS.UserByScreenName,
    "UserByScreenName",
    { screen_name: screenName, withSafetyModeUserFields: true },
    USER_BY_SCREEN_NAME_FEATURES,
  );
  const result = payload?.data?.user?.result;
  if (!result) return null;
  const id = result?.rest_id ?? result?.id;
  const sn = result?.legacy?.screen_name ?? screenName;
  if (!id) return null;
  return { id: String(id), screenName: String(sn) };
}

export async function fetchUserTweetsViaCookies(account: CookieAccount, userId: string, count = 20, followRepost = true): Promise<{ items: WebTimelineMedia[]; tweets: { id: string; text: string | null; urls: string[] }[] }> {
  const payload = await xGraphqlGet(
    account,
    X_WEB_QUERY_IDS.UserTweets,
    "UserTweets",
    { userId, count, includePromotedContent: false, withQuickPromoteEligibilityTweetFields: false, withVoice: false, withV2Timeline: true },
    TIMELINE_FEATURES,
  );

  const entries = pickEntries(payload, "UserTweets");
  const items: WebTimelineMedia[] = [];
  const tweets: { id: string; text: string | null; urls: string[] }[] = [];

  for (const entry of entries) {
    const extracted = extractTweetFromEntry(entry);
    if (!extracted) continue;
    const repost = followRepost ? getRepostedTweet(extracted.tweet) : null;
    const sourceTweet = repost?.tweet ?? extracted.tweet;
    const sourceUser = repost?.user ?? extracted.user;
    const text = legacyTweetText(sourceTweet);
    const username = getUserScreenName(sourceUser);
    items.push(...tweetMediaItems(sourceTweet, username, text));
    const idStr = sourceTweet?.legacy?.id_str ?? sourceTweet?.rest_id;
    if (idStr) {
      tweets.push({ id: String(idStr), text, urls: extractTweetUrls(sourceTweet) });
    }
  }
  return { items, tweets };
}

export async function fetchTweetMediaViaCookies(account: CookieAccount, tweetId: string): Promise<{ items: WebTimelineMedia[]; tweet: { id: string; text: string | null; urls: string[]; username: string } | null }> {
  const payload = await xGraphqlGet(
    account,
    X_WEB_QUERY_IDS.TweetResultByRestId,
    "TweetResultByRestId",
    {
      tweetId,
      withCommunity: true,
      includePromotedContent: false,
      withVoice: false,
    },
    TIMELINE_FEATURES,
  );

  const result = payload?.data?.tweetResult?.result;
  const tweet = result?.tweet ?? result;
  if (!tweet) return { items: [], tweet: null };
  const user = tweet?.core?.user_results?.result ?? null;
  const username = getUserScreenName(user);
  const text = legacyTweetText(tweet);
  const id = tweet?.legacy?.id_str ?? tweet?.rest_id ?? tweetId;
  return {
    items: tweetMediaItems(tweet, username, text),
    tweet: { id: String(id), text, urls: extractTweetUrls(tweet), username },
  };
}

export async function fetchTweetRepliesViaCookies(
  account: CookieAccount,
  tweetId: string,
): Promise<{ urls: string[]; replies: { id: string; text: string | null; urls: string[]; username: string }[] }> {
  const payload = await xGraphqlGet(
    account,
    X_WEB_QUERY_IDS.TweetDetail,
    "TweetDetail",
    {
      focalTweetId: tweetId,
      referrer: "tweet",
      with_rux_injections: false,
      includePromotedContent: false,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: false,
      withBirdwatchNotes: false,
      withVoice: false,
      withV2Timeline: true,
    },
    TIMELINE_FEATURES,
  );

  const instructions = payload?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];
  const entries: any[] = [];
  for (const inst of instructions) {
    if (inst.type === "TimelineAddEntries" && Array.isArray(inst.entries)) {
      entries.push(...inst.entries);
    }
  }

  const replies: { id: string; text: string | null; urls: string[]; username: string }[] = [];
  const allUrls: string[] = [];

  for (const entry of entries) {
    // Replies can be in entry.content.items (conversationthread) or entry.content.itemContent
    const items = entry?.content?.items ?? [{ item: entry?.content }];
    for (const wrapper of items) {
      const itemContent = wrapper?.item?.itemContent ?? wrapper?.itemContent;
      if (itemContent?.__typename !== "TimelineTweet") continue;
      const result = itemContent?.tweet_results?.result;
      const tweet = result?.tweet ?? result;
      if (!tweet?.legacy) continue;
      const idStr = tweet.legacy.id_str ?? tweet.rest_id;
      if (String(idStr) === String(tweetId)) continue; // skip focal tweet
      const user = tweet.core?.user_results?.result ?? null;
      const username = getUserScreenName(user);
      const text = legacyTweetText(tweet);
      const urls = extractTweetUrls(tweet);
      allUrls.push(...urls);
      replies.push({ id: String(idStr), text, urls, username });
    }
  }

  return { urls: allUrls, replies };
}

export async function fetchHomeTimelineViaCookies(account: CookieAccount, count = 20): Promise<{ items: WebTimelineMedia[]; tweets: { id: string; text: string | null; urls: string[]; username: string }[] }> {
  const payload = await xGraphqlPost(
    account,
    X_WEB_QUERY_IDS.HomeLatestTimeline,
    "HomeLatestTimeline",
    {
      variables: {
        count,
        includePromotedContent: false,
        latestControlAvailable: true,
        requestContext: "launch",
        withCommunity: true,
      },
      features: TIMELINE_FEATURES,
      queryId: X_WEB_QUERY_IDS.HomeLatestTimeline,
    },
  );

  const entries = pickEntries(payload, "HomeLatestTimeline");
  const items: WebTimelineMedia[] = [];
  const tweets: { id: string; text: string | null; urls: string[]; username: string }[] = [];
  for (const entry of entries) {
    const extracted = extractTweetFromEntry(entry);
    if (!extracted) continue;
    const username = getUserScreenName(extracted.user);
    const text = legacyTweetText(extracted.tweet);
    items.push(...tweetMediaItems(extracted.tweet, username, text));
    const idStr = extracted.tweet?.legacy?.id_str ?? extracted.tweet?.rest_id;
    if (idStr) {
      tweets.push({ id: String(idStr), text, urls: extractTweetUrls(extracted.tweet), username });
    }
  }
  return { items, tweets };
}

export async function uploadMediaViaCookies(account: CookieAccount, buffer: Buffer, mimeType: string, mediaCategory = "tweet_image"): Promise<string> {
  const totalBytes = buffer.length;
  const initUrl = `https://upload.x.com/i/media/upload.json?command=INIT&total_bytes=${totalBytes}&media_type=${encodeURIComponent(mimeType)}&media_category=${encodeURIComponent(mediaCategory)}`;
  const initRes = await fetchWithProxy(initUrl, {
    method: "POST",
    headers: baseHeaders(account),
    signal: AbortSignal.timeout(30000),
  }, getAccountProxy(account));
  const initPayload = await readJson(initRes) as { media_id_string?: string };
  if (initRes.status === 401 || initRes.status === 403) {
    throw new CookieAuthError(summarizeErrors(initPayload, "Cookies were rejected during media upload."), true);
  }
  if (!initRes.ok) {
    throw new Error(summarizeErrors(initPayload, `Media INIT failed with HTTP ${initRes.status}`));
  }
  const mediaId = initPayload?.media_id_string as string | undefined;
  if (!mediaId) throw new Error("Media INIT did not return media_id_string.");

  const chunkSize = 4 * 1024 * 1024;
  let segment = 0;
  for (let offset = 0; offset < buffer.length; offset += chunkSize, segment++) {
    const chunk = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
    const formData = new FormData();
    formData.append("media", new Blob([new Uint8Array(chunk)], { type: mimeType }), "chunk.bin");
    const appendUrl = `https://upload.x.com/i/media/upload.json?command=APPEND&media_id=${mediaId}&segment_index=${segment}`;
    const headers = baseHeaders(account);
    delete (headers as any)["Content-Type"];
    const appendRes = await fetchWithProxy(appendUrl, {
      method: "POST",
      headers,
      body: formData,
      signal: AbortSignal.timeout(60000),
    }, getAccountProxy(account));
    if (appendRes.status === 401 || appendRes.status === 403) {
      const payload = await readJson(appendRes);
      throw new CookieAuthError(summarizeErrors(payload, "Cookies were rejected during media APPEND."), true);
    }
    if (!appendRes.ok) {
      const payload = await readJson(appendRes);
      throw new Error(summarizeErrors(payload, `Media APPEND #${segment} failed with HTTP ${appendRes.status}`));
    }
  }

  const finalizeUrl = `https://upload.x.com/i/media/upload.json?command=FINALIZE&media_id=${mediaId}`;
  const finalRes = await fetchWithProxy(finalizeUrl, {
    method: "POST",
    headers: baseHeaders(account),
    signal: AbortSignal.timeout(30000),
  }, getAccountProxy(account));
  const finalPayload = await readJson(finalRes);
  if (finalRes.status === 401 || finalRes.status === 403) {
    throw new CookieAuthError(summarizeErrors(finalPayload, "Cookies were rejected during media FINALIZE."), true);
  }
  if (!finalRes.ok) {
    throw new Error(summarizeErrors(finalPayload, `Media FINALIZE failed with HTTP ${finalRes.status}`));
  }
  return mediaId;
}

export async function createTweetViaCookies(account: CookieAccount, text: string, mediaIds: string[] = [], replyToTweetId?: string): Promise<string> {
  const variables: Record<string, unknown> = {
    tweet_text: text,
    dark_request: false,
    media: { media_entities: mediaIds.map((id) => ({ media_id: id, tagged_users: [] })), possibly_sensitive: false },
    semantic_annotation_ids: [],
    ...(replyToTweetId ? { reply: { in_reply_to_tweet_id: replyToTweetId, exclude_reply_user_ids: [] } } : {}),
  };

  const payload = await xGraphqlPost(account, X_WEB_QUERY_IDS.CreateTweet, "CreateTweet", {
    variables,
    features: CREATE_TWEET_FEATURES,
    queryId: X_WEB_QUERY_IDS.CreateTweet,
  });

  const tweetId =
    payload?.data?.create_tweet?.tweet_results?.result?.rest_id ??
    payload?.data?.create_tweet?.tweet_results?.result?.legacy?.id_str;

  if (!tweetId) {
    // Include raw response snippet so we can diagnose what X actually returned
    const rawSnippet = JSON.stringify(payload ?? null).slice(0, 500);
    const baseMsg = summarizeErrors(payload, "X did not return a tweet id after CreateTweet.");
    throw new Error(`${baseMsg} | raw: ${rawSnippet}`);
  }
  return String(tweetId);
}

export type SearchTweetResult = {
  id: string;
  text: string | null;
  username: string;
  name: string | null;
  createdAt: string | null;
  urls?: string[];
};

function extractSearchTweets(payload: any): SearchTweetResult[] {
  const entries = payload?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions
    ?.flatMap((ins: any) => ins?.entries ?? []) ?? [];

  const results: SearchTweetResult[] = [];
  for (const entry of entries) {
    const content = entry?.content?.itemContent ?? entry?.content?.items?.[0]?.item?.itemContent;
    const tweetResult = content?.tweet_results?.result;
    if (!tweetResult) continue;

    const tweet = tweetResult?.tweet ?? tweetResult;
    const legacy = tweet?.legacy;
    const user = tweet?.core?.user_results?.result;
    const userCore = user?.core;
    const userLegacy = user?.legacy;
    const id = tweet?.rest_id ?? legacy?.id_str;
    if (!id || !legacy) continue;

    // screen_name moved from user.legacy to user.core in recent X API updates
    const screenName = userCore?.screen_name ?? userLegacy?.screen_name ?? "";
    const name = userCore?.name ?? userLegacy?.name ?? null;

    const urls = (legacy.entities?.urls ?? [])
      .flatMap((url: any) => [url.unwound_url, url.expanded_url, url.display_url, url.url])
      .filter(Boolean)
      .map((url: string) => /^https?:\/\//i.test(url) ? url : `https://${url}`);

    results.push({
      id: String(id),
      text: legacy.full_text ?? legacy.text ?? null,
      username: screenName,
      name,
      createdAt: userCore?.created_at ?? legacy.created_at ?? null,
      urls: Array.from(new Set(urls)),
    });
  }

  return results;
}

export async function searchTweetsViaCookies(account: CookieAccount, keyword: string, count = 20): Promise<SearchTweetResult[]> {
  const query = keyword.trim();
  if (!query) throw new Error("Search keyword is required.");

  const variables = {
    rawQuery: query,
    count: Math.max(1, Math.min(count, 50)),
    querySource: "typed_query",
    product: "Latest",
  };

  const features = {
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_enhance_cards_enabled: false,
  };

  const payload = await xGraphqlPost(account, X_WEB_QUERY_IDS.SearchTimeline, "SearchTimeline", {
    variables,
    features,
    queryId: X_WEB_QUERY_IDS.SearchTimeline,
  });
  return extractSearchTweets(payload);
}

export async function replyToTweetViaCookies(account: CookieAccount, tweetId: string, text: string): Promise<string> {
  if (!tweetId.trim()) throw new Error("Tweet ID is required.");
  if (!text.trim()) throw new Error("Comment text is required.");
  return createTweetViaCookies(account, text.trim(), [], tweetId.trim());
}

export async function likeTweetViaCookies(account: CookieAccount, tweetId: string): Promise<void> {
  if (!tweetId.trim()) throw new Error("Tweet ID is required.");
  const response = await xGraphqlPost(account, "FavoriteTweet", "lCVzRQGxOGVJf-5JdHD8nQ", {
    variables: { tweet_id: tweetId },
  });
  if (!response.data?.favorite_tweet) {
    const detail = JSON.stringify(response?.errors || response?.data || response).slice(0, 300);
    throw new Error(`Failed to like tweet ${tweetId}: ${detail}`);
  }
}

export async function retweetViaCookies(account: CookieAccount, tweetId: string): Promise<void> {
  if (!tweetId.trim()) throw new Error("Tweet ID is required.");
  const response = await xGraphqlPost(account, "CreateRetweet", "ojPdsZsimiJrUGLR1sjUtA", {
    variables: { tweet_id: tweetId, dark_request: false },
  });
  if (!response.data?.create_retweet) throw new Error("Failed to retweet.");
}

export async function fetchTrendingTopicsViaCookies(account: CookieAccount): Promise<Array<{ name: string; tweet_count?: number }>> {
  try {
    const response = await xGraphqlGet(account, "TrendingTopics", "3Zy_-Uy8Tz_5Yz_Uy8Tz", {
      variables: { count: 20 },
    });
    
    const trends: Array<{ name: string; tweet_count?: number }> = [];
    const timeline = response?.data?.viewer?.timeline?.timeline?.instructions || [];
    
    for (const instruction of timeline) {
      if (instruction.type === "TimelineAddEntries") {
        for (const entry of instruction.entries || []) {
          const content = entry.content;
          if (content?.item?.content?.trend) {
            const trend = content.item.content.trend;
            trends.push({
              name: trend.name || "",
              tweet_count: trend.trendMetadata?.metaDescription ? parseInt(trend.trendMetadata.metaDescription) : undefined,
            });
          }
        }
      }
    }
    
    return trends.filter(t => t.name);
  } catch (error) {
    console.warn("[fetchTrendingTopics] Failed:", error instanceof Error ? error.message : String(error));
    // Fallback: return common trending keywords
    return [
      { name: "viral" },
      { name: "trending" },
      { name: "fyp" },
      { name: "breaking" },
      { name: "news" },
    ];
  }
}

export async function viewTweetViaCookies(account: CookieAccount, tweetId: string): Promise<void> {
  // Simulate viewing a tweet by fetching its details
  if (!tweetId.trim()) throw new Error("Tweet ID is required.");
  await xGraphqlGet(account, "TweetDetail", "nBS-WpgA6ZG0CyNHD517JQ", {
    variables: {
      focalTweetId: tweetId,
      with_rux_injections: false,
      includePromotedContent: true,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
      withV2Timeline: true,
    },
  });
}

/**
 * Update account profile (bio/description, name, location, website).
 * Uses the REST API endpoint (not GraphQL).
 */
export async function updateProfileViaCookies(account: CookieAccount, params: {
  name?: string;
  description?: string;
  location?: string;
  url?: string;
}): Promise<void> {
  const cookie = buildCookieHeader(account);
  if (!cookie || !account.cookieCt0) throw new Error("Account has no cookies configured.");

  const formData = new URLSearchParams();
  if (params.name) formData.append("name", params.name);
  if (params.description !== undefined) formData.append("description", params.description);
  if (params.location !== undefined) formData.append("location", params.location);
  if (params.url !== undefined) formData.append("url", params.url);

  const response = await fetchWithProxy("https://x.com/i/api/1.1/account/update_profile.json", {
    method: "POST",
    headers: {
      ...baseHeaders(account),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  }, getAccountProxy(account));

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Update profile failed: HTTP ${response.status} - ${text.slice(0, 200)}`);
  }
}

/**
 * Update profile image (avatar).
 * Accepts image buffer and uploads it as the new profile picture.
 */
export async function updateProfileImageViaCookies(account: CookieAccount, imageBuffer: Buffer, mimeType = "image/jpeg"): Promise<void> {
  const cookie = buildCookieHeader(account);
  if (!cookie || !account.cookieCt0) throw new Error("Account has no cookies configured.");

  const base64Image = imageBuffer.toString("base64");

  const formData = new URLSearchParams();
  formData.append("image", base64Image);

  const response = await fetchWithProxy("https://x.com/i/api/1.1/account/update_profile_image.json", {
    method: "POST",
    headers: {
      ...baseHeaders(account),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  }, getAccountProxy(account));

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Update profile image failed: HTTP ${response.status} - ${text.slice(0, 200)}`);
  }
}

/**
 * Update profile banner image.
 */
export async function updateBannerViaCookies(account: CookieAccount, imageBuffer: Buffer): Promise<void> {
  const cookie = buildCookieHeader(account);
  if (!cookie || !account.cookieCt0) throw new Error("Account has no cookies configured.");

  const base64Image = imageBuffer.toString("base64");

  const formData = new URLSearchParams();
  formData.append("banner", base64Image);

  const response = await fetchWithProxy("https://x.com/i/api/1.1/account/update_profile_banner.json", {
    method: "POST",
    headers: {
      ...baseHeaders(account),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  }, getAccountProxy(account));

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Update banner failed: HTTP ${response.status} - ${text.slice(0, 200)}`);
  }
}

/**
 * Follow a user by screen name.
 */
export async function followUserViaCookies(account: CookieAccount, screenName: string): Promise<void> {
  const user = await getUserByScreenName(account, screenName);
  if (!user?.rest_id) throw new Error(`User @${screenName} not found.`);

  const response = await fetchWithProxy("https://x.com/i/api/1.1/friendships/create.json", {
    method: "POST",
    headers: {
      ...baseHeaders(account),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ user_id: user.rest_id }).toString(),
  }, getAccountProxy(account));

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Follow failed: HTTP ${response.status} - ${text.slice(0, 200)}`);
  }
}
