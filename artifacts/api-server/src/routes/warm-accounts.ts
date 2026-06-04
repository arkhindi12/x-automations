import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable, settingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { strictLimiter } from "../lib/rate-limiter";
import { searchTweetsViaCookies, likeTweetViaCookies, retweetViaCookies, getUserByScreenName, fetchTrendingTopicsViaCookies, viewTweetViaCookies, fetchHomeTimelineViaCookies, createTweetViaCookies, updateProfileViaCookies, followUserViaCookies } from "../lib/x-web-client";

const router = Router();

export async function ensureWarmAccountSchedulesTable() {
  await db.execute(sql`SELECT pg_advisory_lock(500203)`);
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF to_regclass('public.warm_account_schedules') IS NULL THEN
          DROP SEQUENCE IF EXISTS warm_account_schedules_id_seq;
          CREATE TABLE warm_account_schedules (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL,
            actions TEXT NOT NULL DEFAULT 'like,retweet',
            keywords TEXT NOT NULL,
            max_actions_per_run INTEGER NOT NULL DEFAULT 5,
            schedule_hours INTEGER NOT NULL DEFAULT 24,
            enable_advanced BOOLEAN NOT NULL DEFAULT TRUE,
            warm_days INTEGER NOT NULL DEFAULT 30,
            started_at TIMESTAMP NOT NULL DEFAULT NOW(),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            status TEXT NOT NULL DEFAULT 'idle',
            runs_count INTEGER NOT NULL DEFAULT 0,
            last_run TIMESTAMP,
            next_run TIMESTAMP,
            last_error TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        END IF;
        ALTER TABLE warm_account_schedules ADD COLUMN IF NOT EXISTS enable_advanced BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE warm_account_schedules ADD COLUMN IF NOT EXISTS warm_days INTEGER NOT NULL DEFAULT 30;
        ALTER TABLE warm_account_schedules ADD COLUMN IF NOT EXISTS started_at TIMESTAMP NOT NULL DEFAULT NOW();

        IF to_regclass('public.warm_account_history') IS NULL THEN
          DROP SEQUENCE IF EXISTS warm_account_history_id_seq;
          CREATE TABLE warm_account_history (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL,
            tweet_id TEXT NOT NULL,
            action TEXT NOT NULL,
            keyword TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE(account_id, tweet_id, action)
          );
        END IF;
      END $$;
    `);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(500203)`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAuthOrRateLimitError(error: unknown) {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes("401") || msg.includes("403") || msg.includes("429") || msg.includes("expired") || msg.includes("rejected") || msg.includes("rate limit");
}

async function markAccountRisk(accountId: number, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  const status = lower.includes("429") || lower.includes("rate") ? "rate_limited" : "expired";
  await db.update(accountsTable).set({
    isActive: false,
    healthStatus: status,
    riskScore: status === "rate_limited" ? 70 : 95,
    lastHealthCheck: new Date(),
    lastError: msg.slice(0, 500),
    pausedReason: `Auto-paused: ${status}`,
  }).where(eq(accountsTable.id, accountId));
}

/**
 * Determine warm-up phase based on days since start.
 * 
 * Phase 1 (Day 1-7): Very gentle — browse, view, like 1-2 tweets only
 * Phase 2 (Day 8-14): Getting active — like more, start retweet, follow
 * Phase 3 (Day 15-30): Normal — post tweets, update bio, full engagement
 * Phase 4 (Day 30+): Full mode — everything enabled, higher volume
 */
function getWarmPhase(startedAt: Date | string): { phase: number; day: number; label: string } {
  const start = new Date(startedAt);
  const now = new Date();
  const day = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));

  if (day <= 7) return { phase: 1, day, label: "Gentle (Day 1-7)" };
  if (day <= 14) return { phase: 2, day, label: "Active (Day 8-14)" };
  if (day <= 30) return { phase: 3, day, label: "Normal (Day 15-30)" };
  return { phase: 4, day, label: "Full (Day 30+)" };
}

/**
 * Get limits based on warm-up phase.
 */
function getPhaseLimits(phase: number) {
  switch (phase) {
    case 1: return {
      maxActions: 3,
      canRetweet: false,
      canPostTweet: false,
      canUpdateBio: false,
      canFollow: false,
      likeProbability: 0.5,
      retweetProbability: 0,
      followProbability: 0,
      tweetProbability: 0,
      bioProbability: 0,
      delayMultiplier: 2.0, // Extra slow
    };
    case 2: return {
      maxActions: 5,
      canRetweet: true,
      canPostTweet: false,
      canUpdateBio: false,
      canFollow: true,
      likeProbability: 0.7,
      retweetProbability: 0.2,
      followProbability: 0.15,
      tweetProbability: 0,
      bioProbability: 0,
      delayMultiplier: 1.5,
    };
    case 3: return {
      maxActions: 8,
      canRetweet: true,
      canPostTweet: true,
      canUpdateBio: true,
      canFollow: true,
      likeProbability: 0.85,
      retweetProbability: 0.35,
      followProbability: 0.2,
      tweetProbability: 0.25,
      bioProbability: 0.08,
      delayMultiplier: 1.2,
    };
    default: return {
      maxActions: 12,
      canRetweet: true,
      canPostTweet: true,
      canUpdateBio: true,
      canFollow: true,
      likeProbability: 0.85,
      retweetProbability: 0.4,
      followProbability: 0.2,
      tweetProbability: 0.3,
      bioProbability: 0.1,
      delayMultiplier: 1.0,
    };
  }
}

// Natural human-like delays (in milliseconds)
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getActionDelay(): number {
  // Random delay between actions: 8-25 seconds (human-like)
  return getRandomDelay(8000, 25000);
}

function getReadDelay(): number {
  // Simulate reading tweet: 2-6 seconds
  return getRandomDelay(2000, 6000);
}

function shouldSkipTweet(): boolean {
  // 20% chance to skip a tweet (human doesn't interact with everything)
  return Math.random() < 0.2;
}

function getActionProbability(action: string): number {
  // Humans don't always do all actions
  if (action === "like") return 0.85; // 85% chance to like
  if (action === "retweet") return 0.4; // 40% chance to retweet (more selective)
  return 1.0;
}

/**
 * Generate a casual tweet that looks natural.
 * Uses trending topics or generic thoughts.
 */
async function generateWarmTweet(trends: Array<{ name: string }>, keyword: string): Promise<string | null> {
  // Try AI generation first (if configured)
  try {
    const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    const aiKey = (settings as any)?.openaiApiKey?.trim();
    if (aiKey) {
      const topic = trends.length > 0 ? trends[Math.floor(Math.random() * trends.length)].name : keyword;
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a casual social media user. Write a very short tweet (max 200 chars) about the given topic. Be natural, casual, use lowercase sometimes. No hashtags. No emojis overload. Just 1-2 sentences like a real person would tweet. Vary between opinions, observations, questions, or reactions." },
            { role: "user", content: `Write a casual tweet about: ${topic}` },
          ],
          max_tokens: 100,
          temperature: 1.0,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 5 && text.length < 280) return text;
      }
    }
  } catch {}

  // Fallback: pick from casual templates
  const templates = [
    "just vibing today",
    "anyone else feel like today is going by so slow",
    "need coffee asap",
    "that moment when you realize it's only tuesday",
    "good morning everyone hope y'all have a great day",
    "lowkey tired but can't sleep",
    "the weather today tho",
    "scrolling through my timeline and found some gems",
    "what's everyone up to today?",
    "sometimes you just gotta take a break and breathe",
    "late night thoughts hitting different",
    "productivity level: zero. vibes: immaculate",
    "note to self: drink more water",
    "this week has been something else fr",
    "random thought but does anyone else overthink everything",
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Generate a random bio that looks natural.
 */
function generateRandomBio(): string {
  const bios = [
    "just here for the vibes ✨",
    "living life one day at a time",
    "music • coffee • good conversations",
    "trying to figure it all out",
    "not a bot, just quiet",
    "here for the memes and hot takes",
    "overthinking since '99",
    "casual observer of the internet",
    "probably scrolling at 3am",
    "just a regular person on the internet",
    "thoughts, opinions, and random stuff",
    "life's too short to be serious all the time",
    "still figuring out what to put here",
    "tweets are my own, obviously",
    "just passing through",
    "no thoughts, just tweets",
    "existing on the internet since forever",
    "here for a good time not a long time",
  ];

  return bios[Math.floor(Math.random() * bios.length)];
}

export async function executeWarmAccountRun(params: {
  accountId: number;
  actions: string;
  keywords: string;
  maxActionsPerRun: number;
  enableAdvanced?: boolean;
  startedAt?: string | Date;
  dryRun?: boolean;
}) {
  const { accountId, actions, keywords, maxActionsPerRun, enableAdvanced, startedAt, dryRun } = params;

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
  if (!account) throw new Error("Account not found.");
  if (account.authMode !== "cookies") throw new Error("Warm account requires cookie auth account.");

  await ensureWarmAccountSchedulesTable();

  // Determine warm-up phase
  const warmPhase = getWarmPhase(startedAt || new Date());
  const limits = getPhaseLimits(warmPhase.phase);
  const effectiveMaxActions = Math.min(maxActionsPerRun, limits.maxActions);

  const actionList = actions.split(",").map((a) => a.trim()).filter(Boolean);
  const keywordList = keywords.split("\n").map((k) => k.trim()).filter(Boolean);
  
  if (keywordList.length === 0) throw new Error("At least one keyword is required.");
  if (actionList.length === 0) throw new Error("At least one action is required.");

  const results: Array<{ tweetId?: string; username?: string; action: string; ok: boolean; error?: string; skipped?: boolean }> = [];
  let totalActionsPerformed = 0;

  // Log phase info
  results.push({ action: `phase:${warmPhase.phase}`, ok: true });
  console.log(`[WarmAccount] @${account.username} — ${warmPhase.label} (day ${warmPhase.day}), max ${effectiveMaxActions} actions`);

  // Advanced behavior: Start with trending topics and home timeline
  if (enableAdvanced) {
    let trends: Array<{ name: string; tweet_count?: number }> = [];
    let homeTimeline: { tweets: Array<{ id: string; text: string | null; urls: string[]; username: string }> } = { tweets: [] };

    // 1. Fetch trending topics (simulate clicking trends)
    try {
      await sleep(getRandomDelay(2000, 5000));
      trends = await fetchTrendingTopicsViaCookies(account);
      results.push({ action: "fetch_trends", ok: true });
    } catch (error) {
      console.warn("[WarmAccount] Fetch trends failed:", error instanceof Error ? error.message : String(error));
      results.push({ action: "fetch_trends", ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    
    // 2. Browse home timeline (simulate scrolling)
    try {
      await sleep(getRandomDelay(3000, 7000));
      homeTimeline = await fetchHomeTimelineViaCookies(account, 10);
      results.push({ action: "browse_home", ok: true });
    } catch (error) {
      console.warn("[WarmAccount] Browse home failed:", error instanceof Error ? error.message : String(error));
      results.push({ action: "browse_home", ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    
    // 3. View some tweets from home (simulate clicking)
    const viewCount = Math.min(3, homeTimeline.tweets.length);
    for (let i = 0; i < viewCount; i++) {
      const tweet = homeTimeline.tweets[i];
      try {
        await sleep(getRandomDelay(2000, 5000));
        await viewTweetViaCookies(account, tweet.id);
        results.push({ tweetId: tweet.id, username: tweet.username, action: "view", ok: true });
      } catch (error) {
        console.warn("[WarmAccount] View tweet failed:", error instanceof Error ? error.message : String(error));
        results.push({ tweetId: tweet.id, username: tweet.username, action: "view", ok: false, error: error instanceof Error ? error.message : String(error) });
        continue;
      }
      
      // Sometimes like tweets from home
      if (Math.random() < 0.3 && totalActionsPerformed < maxActionsPerRun) {
        try {
          await sleep(getRandomDelay(1000, 3000));
          await likeTweetViaCookies(account, tweet.id);
          results.push({ tweetId: tweet.id, username: tweet.username, action: "like", ok: true });
          totalActionsPerformed++;
        } catch (error) {
          console.warn("[WarmAccount] Like home tweet failed:", error instanceof Error ? error.message : String(error));
          results.push({ tweetId: tweet.id, username: tweet.username, action: "like", ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    
    // 4. Click on a trending topic (use it as keyword)
    if (trends.length > 0 && Math.random() < 0.5) {
      const trendingKeyword = trends[Math.floor(Math.random() * trends.length)].name;
      keywordList.unshift(trendingKeyword); // Add to front
      results.push({ action: "click_trend", ok: true });
    }

    // 5. Post a casual tweet — only if phase allows
    if (limits.canPostTweet && Math.random() < limits.tweetProbability && totalActionsPerformed < effectiveMaxActions) {
      try {
        await sleep(getRandomDelay(5000, 15000) * limits.delayMultiplier);
        const tweetText = await generateWarmTweet(trends, keywordList[0] || "life");
        if (tweetText) {
          await createTweetViaCookies(account, tweetText);
          results.push({ action: "post_tweet", ok: true });
          totalActionsPerformed++;
          await sleep(getRandomDelay(10000, 20000) * limits.delayMultiplier);
        }
      } catch (error) {
        console.warn("[WarmAccount] Post tweet failed:", error instanceof Error ? error.message : String(error));
        results.push({ action: "post_tweet", ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 6. Update bio/status — only if phase allows
    if (limits.canUpdateBio && Math.random() < limits.bioProbability) {
      try {
        await sleep(getRandomDelay(3000, 8000) * limits.delayMultiplier);
        const newBio = generateRandomBio();
        await updateProfileViaCookies(account, { description: newBio });
        results.push({ action: "update_bio", ok: true });
        await sleep(getRandomDelay(5000, 10000) * limits.delayMultiplier);
      } catch (error) {
        console.warn("[WarmAccount] Update bio failed:", error instanceof Error ? error.message : String(error));
        results.push({ action: "update_bio", ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 7. Follow a random user — only if phase allows
    if (limits.canFollow && Math.random() < limits.followProbability && homeTimeline.tweets.length > 0 && totalActionsPerformed < effectiveMaxActions) {
      const randomTweet = homeTimeline.tweets[Math.floor(Math.random() * homeTimeline.tweets.length)];
      if (randomTweet.username && randomTweet.username.toLowerCase() !== account.username.toLowerCase()) {
        try {
          await sleep(getRandomDelay(3000, 8000) * limits.delayMultiplier);
          await followUserViaCookies(account, randomTweet.username);
          results.push({ username: randomTweet.username, action: "follow", ok: true });
          totalActionsPerformed++;
          await sleep(getRandomDelay(8000, 15000) * limits.delayMultiplier);
        } catch (error) {
          console.warn("[WarmAccount] Follow failed:", error instanceof Error ? error.message : String(error));
          results.push({ username: randomTweet.username, action: "follow", ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  }

  // Pick random keyword
  const keyword = keywordList[Math.floor(Math.random() * keywordList.length)];

  // Search tweets
  let tweets;
  try {
    tweets = await searchTweetsViaCookies(account, keyword, Math.max(20, maxActionsPerRun * 3));
    await db.update(accountsTable).set({ healthStatus: "ok", riskScore: 0, lastSuccessAt: new Date(), lastHealthCheck: new Date(), lastError: null, pausedReason: null }).where(eq(accountsTable.id, accountId));
  } catch (error) {
    if (isAuthOrRateLimitError(error)) await markAccountRisk(accountId, error);
    throw error;
  }
  
  // Filter out already processed tweets
  const candidateIds = tweets.map((tweet) => tweet.id).filter(Boolean);
  const historyResult = candidateIds.length > 0
    ? await db.execute(sql`
        SELECT tweet_id, action FROM warm_account_history 
        WHERE account_id = ${accountId} 
        AND tweet_id IN (${sql.join(candidateIds.map((id) => sql`${id}`), sql`, `)})
      `)
    : { rows: [] } as any;

  const alreadyProcessed = new Map<string, Set<string>>();
  for (const row of ((historyResult as any).rows ?? [])) {
    const tweetId = String(row.tweet_id);
    const action = String(row.action);
    if (!alreadyProcessed.has(tweetId)) alreadyProcessed.set(tweetId, new Set());
    alreadyProcessed.get(tweetId)!.add(action);
  }

  // Select tweets that haven't been processed with all actions yet
  const selected = tweets
    .filter((tweet) => tweet.id && tweet.username.toLowerCase() !== account.username.toLowerCase())
    .filter((tweet) => {
      const processed = alreadyProcessed.get(tweet.id);
      if (!processed) return true;
      // Check if all actions have been done
      return !actionList.every((action) => processed.has(action));
    })
    .slice(0, maxActionsPerRun);

  if (dryRun) {
    return { ok: true, dryRun: true, keyword, selected, skipped: alreadyProcessed.size, results };
  }

  for (const tweet of selected) {
    // Stop if we've reached max actions
    if (totalActionsPerformed >= effectiveMaxActions) break;

    // Simulate reading tweet before deciding to interact
    await sleep(getReadDelay() * limits.delayMultiplier);

    // Sometimes skip tweets (natural behavior)
    if (shouldSkipTweet()) {
      results.push({ tweetId: tweet.id, username: tweet.username, action: "skip", ok: true, skipped: true });
      continue;
    }

    const processed = alreadyProcessed.get(tweet.id) || new Set();
    
    for (const action of actionList) {
      if (processed.has(action)) continue;
      if (totalActionsPerformed >= effectiveMaxActions) break;

      // Phase-based action filtering
      if (action === "retweet" && !limits.canRetweet) continue;

      // Probabilistic action based on phase
      const prob = action === "like" ? limits.likeProbability : limits.retweetProbability;
      if (Math.random() > prob) {
          await db.execute(sql`
            INSERT INTO warm_account_history (account_id, tweet_id, action, keyword)
            VALUES (${accountId}, ${tweet.id}, ${`${action}:skipped`}, ${keyword})
            ON CONFLICT (account_id, tweet_id, action) DO NOTHING
          `);
          results.push({ tweetId: tweet.id, username: tweet.username, action, ok: true, skipped: true });
          continue;
        }

        try {
        if (action === "like") {
          await likeTweetViaCookies(account, tweet.id);
        } else if (action === "retweet") {
          await retweetViaCookies(account, tweet.id);
        } else {
          throw new Error(`Unknown action: ${action}`);
        }

        await db.execute(sql`
          INSERT INTO warm_account_history (account_id, tweet_id, action, keyword)
          VALUES (${accountId}, ${tweet.id}, ${action}, ${keyword})
          ON CONFLICT (account_id, tweet_id, action) DO NOTHING
        `);

        results.push({ tweetId: tweet.id, username: tweet.username, action, ok: true });
        totalActionsPerformed++;
        
        // Natural delay between actions — slower in early phases
        await sleep(getActionDelay() * limits.delayMultiplier);
      } catch (error) {
        await db.execute(sql`
          INSERT INTO warm_account_history (account_id, tweet_id, action, keyword)
          VALUES (${accountId}, ${tweet.id}, ${`${action}:failed`}, ${keyword})
          ON CONFLICT (account_id, tweet_id, action) DO NOTHING
        `);
        results.push({ 
          tweetId: tweet.id, 
          username: tweet.username, 
          action, 
          ok: false, 
          error: error instanceof Error ? error.message : String(error) 
        });
        // Longer delay after error (simulate confusion/checking)
        await sleep(getRandomDelay(15000, 30000));
      }
    }

    // Random pause between tweets (simulate scrolling)
    await sleep(getRandomDelay(3000, 8000));
  }

  return { ok: true, keyword, attempted: selected.length, performed: totalActionsPerformed, skipped: alreadyProcessed.size, results };
}

router.post("/run", strictLimiter, async (req, res) => {
  try {
    const accountId = Number(req.body?.accountId);
    const actions = String(req.body?.actions ?? "like,retweet").trim();
    const keywords = String(req.body?.keywords ?? "").trim();
    const maxActionsPerRun = Math.max(1, Math.min(Number(req.body?.maxActionsPerRun) || 5, 20));
    const enableAdvanced = Boolean(req.body?.enableAdvanced ?? true);
    const dryRun = Boolean(req.body?.dryRun);

    if (!accountId || Number.isNaN(accountId)) return res.status(400).json({ ok: false, error: "Account ID is required." });
    if (!keywords) return res.status(400).json({ ok: false, error: "Keywords are required." });

    const result = await executeWarmAccountRun({ accountId, actions, keywords, maxActionsPerRun, enableAdvanced, dryRun });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Warm account run failed." });
  }
});

router.get("/schedules", async (_req, res) => {
  try {
    await ensureWarmAccountSchedulesTable();
    const result = await db.execute(sql`
      SELECT s.*, a.username AS account_username
      FROM warm_account_schedules s
      LEFT JOIN accounts a ON a.id = s.account_id
      ORDER BY s.created_at DESC
    `);
    return res.json({ ok: true, schedules: (result as any).rows ?? [] });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to list schedules." });
  }
});

router.post("/schedules", strictLimiter, async (req, res) => {
  try {
    await ensureWarmAccountSchedulesTable();
    const accountId = Number(req.body?.accountId);
    const actions = String(req.body?.actions ?? "like,retweet").trim();
    const keywords = String(req.body?.keywords ?? "").trim();
    const maxActionsPerRun = Math.max(1, Math.min(Number(req.body?.maxActionsPerRun) || 5, 20));
    const scheduleHours = Math.max(1, Math.min(Number(req.body?.scheduleHours) || 24, 168));
    const enableAdvanced = Boolean(req.body?.enableAdvanced ?? true);
    const warmDays = Math.max(7, Math.min(Number(req.body?.warmDays) || 30, 90));

    if (!accountId || Number.isNaN(accountId)) return res.status(400).json({ ok: false, error: "Account ID is required." });
    if (!keywords) return res.status(400).json({ ok: false, error: "Keywords are required." });

    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) return res.status(404).json({ ok: false, error: "Account not found." });
    if (account.authMode !== "cookies") return res.status(400).json({ ok: false, error: "Warm account requires cookie auth account." });

    const nextRun = new Date(Date.now() + scheduleHours * 3600_000);
    const result = await db.execute(sql`
      INSERT INTO warm_account_schedules (account_id, actions, keywords, max_actions_per_run, schedule_hours, enable_advanced, warm_days, started_at, next_run)
      VALUES (${accountId}, ${actions}, ${keywords}, ${maxActionsPerRun}, ${scheduleHours}, ${enableAdvanced}, ${warmDays}, NOW(), ${nextRun})
      RETURNING *
    `);
    return res.json({ ok: true, schedule: ((result as any).rows ?? [])[0] });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to create schedule." });
  }
});

router.post("/schedules/:id/toggle", async (req, res) => {
  try {
    await ensureWarmAccountSchedulesTable();
    const id = Number(req.params.id);
    const current = await db.execute(sql`SELECT * FROM warm_account_schedules WHERE id = ${id}`);
    const schedule = ((current as any).rows ?? [])[0];
    if (!schedule) return res.status(404).json({ ok: false, error: "Schedule not found." });
    const nextActive = !schedule.is_active;
    const nextRun = nextActive ? new Date(Date.now() + Number(schedule.schedule_hours) * 3600_000) : null;
    const result = await db.execute(sql`
      UPDATE warm_account_schedules
      SET is_active = ${nextActive}, status = CASE WHEN status = 'running' THEN status ELSE 'idle' END, next_run = ${nextRun}
      WHERE id = ${id}
      RETURNING *
    `);
    return res.json({ ok: true, schedule: ((result as any).rows ?? [])[0] });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to toggle schedule." });
  }
});

router.delete("/schedules/:id", async (req, res) => {
  try {
    await ensureWarmAccountSchedulesTable();
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM warm_account_schedules WHERE id = ${id}`);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to delete schedule." });
  }
});

router.get("/history", async (req, res) => {
  try {
    await ensureWarmAccountSchedulesTable();
    const accountId = req.query.accountId ? Number(req.query.accountId) : null;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    
    const result = accountId
      ? await db.execute(sql`
          SELECT h.*, a.username AS account_username
          FROM warm_account_history h
          LEFT JOIN accounts a ON a.id = h.account_id
          WHERE h.account_id = ${accountId}
          ORDER BY h.created_at DESC
          LIMIT ${limit}
        `)
      : await db.execute(sql`
          SELECT h.*, a.username AS account_username
          FROM warm_account_history h
          LEFT JOIN accounts a ON a.id = h.account_id
          ORDER BY h.created_at DESC
          LIMIT ${limit}
        `);
    
    return res.json({ ok: true, history: (result as any).rows ?? [] });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to get history." });
  }
});

export default router;
