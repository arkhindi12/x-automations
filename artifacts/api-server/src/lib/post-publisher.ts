import { createHmac, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { accountsTable, activityTable, jobsTable, mediaTable, postsTable } from "@workspace/db";
import { and, eq, lte, sql } from "drizzle-orm";
import { logger, postLogger, mediaLogger } from "./structured-logger";
import { applyWatermark } from "./watermark";
import { createTweetViaCookies, uploadMediaViaCookies } from "./x-web-client";

type XTweetResponse = {
  data?: {
    id?: string;
    text?: string;
  };
  detail?: string;
  title?: string;
  errors?: Array<{ detail?: string; title?: string; message?: string }>;
};

type XMediaUploadResponse = {
  media_id_string?: string;
  media_id?: number;
  error?: string;
  errors?: Array<{ message?: string }>;
};

let publisherRunning = false;

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader(account: typeof accountsTable.$inferSelect, method: string, url: string) {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: account.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: account.accessToken,
    oauth_version: "1.0",
  };

  const parameterString = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");

  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(parameterString),
  ].join("&");

  const signingKey = `${percentEncode(account.apiSecret)}&${percentEncode(account.accessTokenSecret)}`;
  oauthParams.oauth_signature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  return `OAuth ${Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`;
}

function getLargeImageUrl(originalUrl: string) {
  try {
    const url = new URL(originalUrl);
    if (url.hostname.endsWith("twimg.com")) {
      url.searchParams.set("name", "large");
    }
    return url.toString();
  } catch {
    return originalUrl;
  }
}

function getImageExtension(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

async function fetchImageBuffer(originalUrl: string) {
  const imageUrl = getLargeImageUrl(originalUrl);
  const response = await fetch(imageUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Image download failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Downloaded file is not an image (${contentType}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length === 0) {
    throw new Error("Downloaded image is empty.");
  }

  return { buffer, contentType, imageUrl };
}

async function prepareImageBuffer(
  media: typeof mediaTable.$inferSelect,
  job?: typeof jobsTable.$inferSelect | null,
) {
  // For video media, use thumbnailUrl as the image to upload to X
  const imageSource = media.type === "video" && media.thumbnailUrl
    ? media.thumbnailUrl
    : media.originalUrl;
  let { buffer, contentType, imageUrl }: { buffer: Buffer<ArrayBufferLike>; contentType: string; imageUrl: string } = await fetchImageBuffer(imageSource);

  if (job?.watermarkEnabled) {
    try {
      const result = await applyWatermark(buffer, contentType, {
        type: (job.watermarkType ?? "text") as "text" | "logo",
        text: job.watermarkText,
        fontSize: job.watermarkFontSize ?? 24,
        fontWeight: job.watermarkFontWeight ?? "bold",
        color: job.watermarkColor ?? "#ffffff",
        opacity: job.watermarkOpacity ?? 0.8,
        position: job.watermarkPosition ?? "bottom-right",
        logoUrl: job.watermarkLogoUrl,
      });
      buffer = result.buffer;
      contentType = result.contentType;
      mediaLogger.watermarkApplied(media.id, job.watermarkType ?? "text");
    } catch (wmError) {
      mediaLogger.watermarkFailed(media.id, wmError instanceof Error ? wmError.message : String(wmError));
    }
  }
  return { buffer, contentType, imageUrl };
}

async function uploadImageOAuth(
  account: typeof accountsTable.$inferSelect,
  media: typeof mediaTable.$inferSelect,
  job?: typeof jobsTable.$inferSelect | null,
) {
  const { buffer, contentType, imageUrl } = await prepareImageBuffer(media, job);

  const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";
  const blob = new Blob([buffer as any], { type: contentType });
  const formData = new FormData();
  formData.append("media", blob, `media-${media.id}.${getImageExtension(contentType)}`);
  formData.append("media_category", "tweet_image");

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: buildOAuthHeader(account, "POST", uploadUrl),
      Accept: "application/json",
    },
    body: formData,
    signal: AbortSignal.timeout(45000),
  });

  const payload = await response.json().catch(() => null) as XMediaUploadResponse | null;
  const mediaId = payload?.media_id_string ?? (payload?.media_id ? String(payload.media_id) : null);

  if (!response.ok || !mediaId) {
    const message = payload?.error ?? payload?.errors?.[0]?.message ?? `HTTP ${response.status}`;
    throw new Error(`X image upload failed for media #${media.id} from ${imageUrl}: ${message}`);
  }

  return mediaId;
}

async function uploadImageCookies(
  account: typeof accountsTable.$inferSelect,
  media: typeof mediaTable.$inferSelect,
  job?: typeof jobsTable.$inferSelect | null,
) {
  const { buffer, contentType } = await prepareImageBuffer(media, job);
  return uploadMediaViaCookies(account, buffer, contentType, "tweet_image");
}

async function uploadImageToX(
  account: typeof accountsTable.$inferSelect,
  media: typeof mediaTable.$inferSelect,
  job?: typeof jobsTable.$inferSelect | null,
) {
  if (account.authMode === "cookies") return uploadImageCookies(account, media, job);
  return uploadImageOAuth(account, media, job);
}

async function postTweetOAuth(account: typeof accountsTable.$inferSelect, text: string, mediaIds: string[] = []) {
  const urls = ["https://api.x.com/2/tweets", "https://api.twitter.com/2/tweets"];
  let lastError = "Unable to publish tweet.";

  for (const url of urls) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: buildOAuthHeader(account, "POST", url),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(mediaIds.length > 0 ? { text, media: { media_ids: mediaIds } } : { text }),
      signal: AbortSignal.timeout(20000),
    });

    const payload = await response.json().catch(() => null) as XTweetResponse | null;
    if (response.ok && payload?.data?.id) {
      return payload.data.id;
    }

    lastError = payload?.detail ?? payload?.errors?.[0]?.detail ?? payload?.errors?.[0]?.message ?? payload?.title ?? `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) break;
  }

  throw new Error(lastError);
}

async function postTweet(account: typeof accountsTable.$inferSelect, text: string, mediaIds: string[] = []) {
  if (account.authMode === "cookies") return createTweetViaCookies(account, text, mediaIds);
  return postTweetOAuth(account, text, mediaIds);
}

/**
 * Auto-reactivate accounts that were paused due to automated detection.
 * Reactivates after 3-6 hours (based on when they were paused).
 * Uses activity log to determine pause time.
 */
async function autoReactivatePausedAccounts() {
  try {
    // Find inactive accounts that have a recent auto-pause activity entry
    const pausedAccounts = await db.select({
      id: accountsTable.id,
      username: accountsTable.username,
    }).from(accountsTable).where(eq(accountsTable.isActive, false));

    for (const account of pausedAccounts) {
      // Check if there's an auto-pause activity within last 12 hours
      const pauseActivity = await db.execute(sql`
        SELECT created_at FROM activity
        WHERE account_username = ${account.username}
          AND message LIKE '%auto-paused%'
          AND created_at > NOW() - INTERVAL '12 hours'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      const pauseRow = ((pauseActivity as any).rows ?? [])[0];
      if (!pauseRow) continue; // Not auto-paused, skip (manually disabled)

      const pausedAt = new Date(pauseRow.created_at);
      const hoursSincePause = (Date.now() - pausedAt.getTime()) / (60 * 60 * 1000);

      // Reactivate after 3 hours minimum
      if (hoursSincePause >= 3) {
        await db.update(accountsTable).set({ isActive: true }).where(eq(accountsTable.id, account.id));
        await db.insert(activityTable).values({
          type: "info",
          message: `@${account.username} auto-reactivated after ${Math.round(hoursSincePause)}h pause.`,
          accountUsername: account.username,
        });
        logger.info({ accountId: account.id, username: account.username, hoursSincePause: Math.round(hoursSincePause) }, "[AutoPause] Account reactivated");
      }
    }
  } catch (error) {
    // Non-fatal
    logger.warn({ err: error }, "[AutoPause] Failed to check paused accounts");
  }
}

export async function publishDuePosts() {
  if (publisherRunning) return;
  publisherRunning = true;

  try {
    // Auto-reactivate accounts that were paused (check every publish cycle)
    await autoReactivatePausedAccounts();

    const duePosts = await db.select().from(postsTable).where(and(
      eq(postsTable.status, "pending"),
      lte(postsTable.scheduledAt, new Date()),
    )).orderBy(postsTable.scheduledAt).limit(5);

    for (const post of duePosts) {
      const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, post.accountId));
      if (!account) {
        await db.update(postsTable).set({ status: "failed" }).where(eq(postsTable.id, post.id));
        await db.insert(activityTable).values({
          type: "error",
          message: `Scheduled post #${post.id} failed because its account is missing.`,
        });
        continue;
      }

      // If account is paused (inactive), skip — don't fail, just leave pending
      if (!account.isActive) {
        continue;
      }

      try {
        postLogger.publishing(post.id, account.id, account.username);
        
        let mediaIds: string[] = [];
        if (post.mediaId) {
          const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, post.mediaId));
          if (media) {
            const [job] = media.jobId
              ? await db.select().from(jobsTable).where(eq(jobsTable.id, media.jobId))
              : [null];
            try {
              // For videos without thumbnail, skip image upload silently
              if (media.type === "video" && !media.thumbnailUrl) {
                postLogger.mediaUploadFailed(post.id, media.id, "Video has no thumbnail, skipping image attachment");
              } else {
                const mediaId = await uploadImageToX(account, media, job ?? null);
                mediaIds = mediaId ? [mediaId] : [];
                if (mediaId) {
                  postLogger.mediaUploaded(post.id, media.id, mediaId);
                }
              }
            } catch (imgError) {
              const errMsg = imgError instanceof Error ? imgError.message : String(imgError);
              postLogger.mediaUploadFailed(post.id, media.id, errMsg);
              // For both images and videos: if upload fails (e.g. 403 expired URL), post text-only instead of failing
              // This prevents posts from permanently failing due to expired CDN URLs
            }
          }
        }

        const xPostId = await postTweet(account, post.content, mediaIds);
        await db.update(postsTable).set({
          status: "posted",
          postedAt: new Date(),
          xPostId,
        }).where(eq(postsTable.id, post.id));
        await db.update(accountsTable).set({
          postsCount: sql`${accountsTable.postsCount} + 1`,
        }).where(eq(accountsTable.id, account.id));
        await db.insert(activityTable).values({
          type: "post",
          message: mediaIds.length > 0
            ? `Scheduled post #${post.id} was published to @${account.username} with a re-uploaded image attachment.`
            : `Scheduled post #${post.id} was published to @${account.username}.`,
          accountUsername: account.username,
        });
        
        postLogger.published(post.id, account.id, account.username, xPostId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        postLogger.failed(post.id, account.id, account.username, errorMessage);

        // Transient errors: don't mark failed, reschedule for retry instead
        // - "did not return a tweet id" — sometimes X returns empty response, retry usually works
        // - network/timeout errors — temporary connectivity issues
        const isTransient =
          errorMessage.includes("did not return a tweet id") ||
          errorMessage.includes("ETIMEDOUT") ||
          errorMessage.includes("ECONNRESET") ||
          errorMessage.includes("fetch failed") ||
          errorMessage.includes("network");

        const retryCount = (post as any).retryCount ?? 0;
        const MAX_RETRIES = 2;

        if (isTransient && retryCount < MAX_RETRIES) {
          // Reschedule with random 5-15 minute backoff
          const backoffMinutes = 5 + Math.floor(Math.random() * 10);
          const nextTry = new Date(Date.now() + backoffMinutes * 60 * 1000);
          await db.update(postsTable).set({
            scheduledAt: nextTry,
            retryCount: retryCount + 1,
          } as any).where(eq(postsTable.id, post.id));
          await db.insert(activityTable).values({
            type: "info",
            message: `Scheduled post #${post.id} hit transient error (retry ${retryCount + 1}/${MAX_RETRIES} in ${backoffMinutes}m): ${errorMessage.slice(0, 200)}`,
            accountUsername: account.username,
          });
          continue;
        }

        await db.update(postsTable).set({ status: "failed" }).where(eq(postsTable.id, post.id));
        await db.insert(activityTable).values({
          type: "error",
          message: `Scheduled post #${post.id} failed: ${errorMessage}`,
          accountUsername: account.username,
        });

        // Auto-pause account if detected as automated (226) or daily limit (344)
        if (errorMessage.includes("226") || errorMessage.includes("344") || errorMessage.includes("automated")) {
          const pauseHours = errorMessage.includes("344") ? 6 : 3;
          const pauseUntil = new Date(Date.now() + pauseHours * 60 * 60 * 1000);
          await db.update(accountsTable).set({
            isActive: false,
          }).where(eq(accountsTable.id, account.id));

          // Reschedule remaining pending posts for this account to after pause
          await db.execute(sql`
            UPDATE posts
            SET scheduled_at = ${pauseUntil}
            WHERE account_id = ${account.id}
              AND status = 'pending'
              AND scheduled_at <= NOW()
          `);

          await db.insert(activityTable).values({
            type: "error",
            message: `@${account.username} auto-paused for ${pauseHours}h — X detected automated activity (${errorMessage.includes("344") ? "daily limit" : "error 226"}). Pending posts rescheduled.`,
            accountUsername: account.username,
          });

          logger.warn({ accountId: account.id, username: account.username, pauseHours }, "[AutoPause] Account paused due to automated detection");

          // Skip this post/account pause handling, but keep publishing posts for other accounts in this batch
          continue;
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Post publisher failed");
  } finally {
    publisherRunning = false;
  }
}