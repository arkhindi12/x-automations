import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { searchTweetsViaCookies, replyToTweetViaCookies } from "../lib/x-web-client";
import { strictLimiter } from "../lib/rate-limiter";

const router = Router();

type AutoCommentBody = {
  accountId?: number;
  keyword?: string;
  commentText?: string;
  linkRotator?: string;
  maxComments?: number;
  delaySeconds?: number;
  dryRun?: boolean;
  aiEnabled?: boolean;
  aiProvider?: "openai" | "groq";
  aiApiKey?: string;
  aiPrompt?: string;
};

export async function ensureAutoCommentSchedulesTable() {
  await db.execute(sql`SELECT pg_advisory_lock(500201)`);
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF to_regclass('public.auto_comment_schedules') IS NULL THEN
          DROP SEQUENCE IF EXISTS auto_comment_schedules_id_seq;
          CREATE TABLE auto_comment_schedules (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL,
            keyword TEXT NOT NULL,
            comment_text TEXT NOT NULL,
            link_rotator TEXT,
            ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            ai_provider TEXT NOT NULL DEFAULT 'openai',
            ai_api_key TEXT,
            ai_prompt TEXT,
            max_comments INTEGER NOT NULL DEFAULT 1,
            delay_seconds INTEGER NOT NULL DEFAULT 30,
            schedule_minutes INTEGER NOT NULL DEFAULT 60,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            status TEXT NOT NULL DEFAULT 'idle',
            runs_count INTEGER NOT NULL DEFAULT 0,
            last_run TIMESTAMP,
            next_run TIMESTAMP,
            last_error TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
        END IF;
        ALTER TABLE auto_comment_schedules ADD COLUMN IF NOT EXISTS link_rotator TEXT;
        ALTER TABLE auto_comment_schedules ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE auto_comment_schedules ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'openai';
        ALTER TABLE auto_comment_schedules ADD COLUMN IF NOT EXISTS ai_api_key TEXT;
        ALTER TABLE auto_comment_schedules ADD COLUMN IF NOT EXISTS ai_prompt TEXT;

        IF to_regclass('public.auto_comment_history') IS NULL THEN
          DROP SEQUENCE IF EXISTS auto_comment_history_id_seq;
          CREATE TABLE auto_comment_history (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL,
            tweet_id TEXT NOT NULL,
            username TEXT,
            keyword TEXT,
            comment_text TEXT,
            reply_id TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE(account_id, tweet_id)
          );
        END IF;
      END $$;
    `);
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(500201)`);
  }
}

function parseBody(body: AutoCommentBody) {
  const accountId = Number(body.accountId);
  const keyword = body.keyword?.trim() ?? "";
  const commentText = body.commentText?.trim() ?? "";
  const linkRotator = body.linkRotator?.trim() ?? "";
  const maxComments = Math.max(1, Math.min(Number(body.maxComments) || 1, 10));
  const delaySeconds = Math.max(5, Math.min(Number(body.delaySeconds) || 30, 300));
  const dryRun = Boolean(body.dryRun);
  const aiEnabled = Boolean(body.aiEnabled);
  const aiProvider = body.aiProvider === "groq" ? "groq" : "openai";
  const aiApiKey = body.aiApiKey?.trim() ?? "";
  const aiPrompt = body.aiPrompt?.trim() ?? "";

  if (!accountId || Number.isNaN(accountId)) throw new Error("Account ID is required.");
  if (!keyword) throw new Error("Search keyword is required.");
  if (!aiEnabled && !commentText && !dryRun) throw new Error("Comment text is required.");
  if (aiEnabled && !aiApiKey && !dryRun) throw new Error("AI API key is required when AI mode is enabled.");

  return { accountId, keyword, commentText, linkRotator, maxComments, delaySeconds, dryRun, aiEnabled, aiProvider, aiApiKey, aiPrompt };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max (human-like timing).
 * Adds jitter so actions don't happen at exact intervals.
 */
function humanDelay(baseSeconds: number): number {
  const jitter = 0.3 + Math.random() * 0.7; // 30%-100% of base
  const extra = Math.floor(Math.random() * 15); // 0-15 extra seconds
  return Math.floor(baseSeconds * jitter * 1000) + extra * 1000;
}

/**
 * Add slight text variations to avoid exact duplicate detection.
 * Randomly adds/removes trailing punctuation, spaces, or invisible chars.
 */
function humanizeText(text: string): string {
  let result = text.trim();

  // Randomly add/remove trailing emoji or punctuation
  const suffixes = ["", " ", "  ", " 🔥", " 👀", " 💯", " ✨", " 🎬", " 👍", "!", "..", "~"];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

  // Randomly capitalize first letter or not
  if (Math.random() > 0.5 && result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  return result + suffix;
}

function parseCommentVariants(commentText: string) {
  const raw = commentText.trim();
  if (!raw) return [];

  // Preferred delimiter for multi-line messages: put --- between variants.
  // If no delimiter exists, each non-empty line becomes one variant.
  const variants = raw.includes("---")
    ? raw.split(/\n\s*---\s*\n/g)
    : raw.split(/\n+/g);

  return variants.map((variant) => variant.trim()).filter(Boolean);
}

function pickRotatedComment(commentText: string, index: number) {
  const variants = parseCommentVariants(commentText);
  return variants.length > 0 ? variants[index % variants.length] : commentText;
}

function parseLinkVariants(linkRotator: string) {
  return linkRotator
    .split(/[\n,]+/g)
    .map((link) => link.trim())
    .filter(Boolean);
}

function pickRotatedLink(linkRotator: string, index: number) {
  const links = parseLinkVariants(linkRotator);
  return links.length > 0 ? links[index % links.length] : "";
}

function renderTemplateVariables(text: string) {
  return text;
}

function buildRotatedComment(commentText: string, linkRotator: string, index: number) {
  const comment = renderTemplateVariables(pickRotatedComment(commentText, index));
  const link = pickRotatedLink(linkRotator, index);
  return link ? `${comment}\n\n${link}` : comment;
}

async function generateAIComment(opts: {
  provider: "openai" | "groq";
  apiKey: string;
  prompt: string;
  tweetText: string;
  username: string;
  keyword: string;
}): Promise<string | null> {
  const tweetSnippet = (opts.tweetText || "").trim().slice(0, 800);
  if (!tweetSnippet) return null;

  const systemPrompt = opts.prompt?.trim()
    || `You write short, friendly, natural-sounding replies on X (Twitter).
- Reply in the same language as the tweet (Indonesia or English).
- 1-2 short sentences, max 200 characters.
- Be relevant to the tweet content. No hashtags. No mentions. No emojis spam (max 1).
- Sound like a real human, not a bot. Don't repeat the tweet text.
- Output only the reply text, no quotes, no labels.`;

  const userMessage = `Keyword context: ${opts.keyword}\nUser: @${opts.username}\nTweet: ${tweetSnippet}\n\nWrite a natural reply for this tweet.`;

  try {
    if (opts.provider === "groq") {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0.8,
          max_tokens: 120,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        }),
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Groq error ${response.status}: ${errText.slice(0, 200)}`);
      }
      const data: any = await response.json();
      return String(data?.choices?.[0]?.message?.content ?? "").trim() || null;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        max_tokens: 120,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`OpenAI error ${response.status}: ${errText.slice(0, 200)}`);
    }
    const data: any = await response.json();
    return String(data?.choices?.[0]?.message?.content ?? "").trim() || null;
  } catch (error) {
    console.warn(`[AUTO-COMMENT-AI] ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

router.post("/search", strictLimiter, async (req, res) => {
  try {
    const { accountId, keyword } = parseBody({ ...req.body, dryRun: true });
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) return res.status(404).json({ error: "Account not found." });
    if (account.authMode !== "cookies") return res.status(400).json({ error: "Search requires cookie auth account." });

    const tweets = await searchTweetsViaCookies(account, keyword, 20);
    return res.json({ ok: true, keyword, tweets });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Search failed." });
  }
});

export async function executeAutoCommentRun(body: AutoCommentBody) {
  const { accountId, keyword, commentText, linkRotator, maxComments, delaySeconds, dryRun, aiEnabled, aiProvider, aiApiKey, aiPrompt } = parseBody(body ?? {});
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
  if (!account) throw new Error("Account not found.");
  if (account.authMode !== "cookies") throw new Error("Auto comment requires cookie auth account.");

  await ensureAutoCommentSchedulesTable();
  const tweets = await searchTweetsViaCookies(account, keyword, Math.max(20, maxComments * 5));
  const candidateIds = tweets.map((tweet) => tweet.id).filter(Boolean);
  const historyResult = candidateIds.length > 0
    ? await db.execute(sql`SELECT tweet_id FROM auto_comment_history WHERE account_id = ${accountId} AND tweet_id IN (${sql.join(candidateIds.map((id) => sql`${id}`), sql`, `)})`)
    : { rows: [] } as any;
  const alreadyCommented = new Set<string>(((historyResult as any).rows ?? []).map((row: any) => String(row.tweet_id)));

  const selected = tweets
    .filter((tweet) => tweet.id && tweet.username.toLowerCase() !== account.username.toLowerCase())
    .filter((tweet) => !alreadyCommented.has(tweet.id))
    .slice(0, maxComments);

  if (dryRun) {
    return { ok: true, dryRun: true, keyword, selected, skippedDuplicates: alreadyCommented.size };
  }

  // Initial random pause (3-12 seconds) — simulate human opening the page first
  const initialPause = 3000 + Math.floor(Math.random() * 9000);
  await sleep(initialPause);

  const results: Array<{ tweetId: string; username: string; ok: boolean; replyId?: string; error?: string; commentText?: string }> = [];
  for (let i = 0; i < selected.length; i++) {
    const tweet = selected[i];
    try {
      let baseComment = aiEnabled
        ? await generateAIComment({
          provider: aiProvider,
          apiKey: aiApiKey,
          prompt: aiPrompt,
          tweetText: tweet.text ?? "",
          username: tweet.username,
          keyword,
        })
        : null;
      if (!baseComment) baseComment = buildRotatedComment(commentText, linkRotator, i);
      if (aiEnabled && linkRotator.trim()) {
        const link = pickRotatedLink(linkRotator, i);
        if (link) baseComment = `${baseComment}\n\n${link}`;
      }
      const finalComment = humanizeText(baseComment);
      const replyId = await replyToTweetViaCookies(account, tweet.id, finalComment);
      await db.execute(sql`
        INSERT INTO auto_comment_history (account_id, tweet_id, username, keyword, comment_text, reply_id)
        VALUES (${accountId}, ${tweet.id}, ${tweet.username}, ${keyword}, ${finalComment}, ${replyId})
        ON CONFLICT (account_id, tweet_id) DO NOTHING
      `);
      results.push({ tweetId: tweet.id, username: tweet.username, ok: true, replyId, commentText: finalComment });
    } catch (error) {
      results.push({ tweetId: tweet.id, username: tweet.username, ok: false, error: error instanceof Error ? error.message : String(error), commentText: buildRotatedComment(commentText, linkRotator, i) });

      // If rate limited or automated detection, stop immediately — don't burn the account
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes("226") || errMsg.includes("344") || errMsg.includes("automated") || errMsg.includes("daily limit")) {
        break;
      }
    }

    // Human-like delay between comments (randomized around base delay)
    if (i < selected.length - 1) {
      const delay = humanDelay(delaySeconds);
      await sleep(delay);
    }
  }

  return { ok: true, keyword, attempted: results.length, skippedDuplicates: alreadyCommented.size, results };
}

router.post("/run", strictLimiter, async (req, res) => {
  try {
    return res.json(await executeAutoCommentRun(req.body ?? {}));
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Auto comment failed." });
  }
});

router.get("/schedules", async (_req, res) => {
  try {
    await ensureAutoCommentSchedulesTable();
    const result = await db.execute(sql`
      SELECT s.*, a.username AS account_username
      FROM auto_comment_schedules s
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
    await ensureAutoCommentSchedulesTable();
    const { accountId, keyword, commentText, linkRotator, maxComments, delaySeconds, aiEnabled, aiProvider, aiApiKey, aiPrompt } = parseBody(req.body ?? {});
    const scheduleMinutes = Math.max(5, Math.min(Number(req.body?.scheduleMinutes) || 60, 1440));
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) return res.status(404).json({ ok: false, error: "Account not found." });
    if (account.authMode !== "cookies") return res.status(400).json({ ok: false, error: "Auto comment schedule requires cookie auth account." });

    const nextRun = new Date(Date.now() + scheduleMinutes * 60_000);
    const result = await db.execute(sql`
      INSERT INTO auto_comment_schedules (account_id, keyword, comment_text, link_rotator, ai_enabled, ai_provider, ai_api_key, ai_prompt, max_comments, delay_seconds, schedule_minutes, next_run)
      VALUES (${accountId}, ${keyword}, ${commentText}, ${linkRotator || null}, ${aiEnabled}, ${aiProvider}, ${aiApiKey || null}, ${aiPrompt || null}, ${maxComments}, ${delaySeconds}, ${scheduleMinutes}, ${nextRun})
      RETURNING *
    `);
    return res.json({ ok: true, schedule: ((result as any).rows ?? [])[0] });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to create schedule." });
  }
});

router.put("/schedules/:id", strictLimiter, async (req, res) => {
  try {
    await ensureAutoCommentSchedulesTable();
    const id = Number(req.params.id);
    const { accountId, keyword, commentText, linkRotator, maxComments, delaySeconds, aiEnabled, aiProvider, aiApiKey, aiPrompt } = parseBody(req.body ?? {});
    const scheduleMinutes = Math.max(5, Math.min(Number(req.body?.scheduleMinutes) || 60, 1440));
    const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
    if (!account) return res.status(404).json({ ok: false, error: "Account not found." });
    if (account.authMode !== "cookies") return res.status(400).json({ ok: false, error: "Auto comment schedule requires cookie auth account." });

    const current = await db.execute(sql`SELECT * FROM auto_comment_schedules WHERE id = ${id}`);
    const schedule = ((current as any).rows ?? [])[0];
    if (!schedule) return res.status(404).json({ ok: false, error: "Schedule not found." });

    const resetNextRun = schedule.is_active && schedule.status !== "running";
    const nextRun = resetNextRun ? new Date(Date.now() + scheduleMinutes * 60_000) : schedule.next_run;
    const result = await db.execute(sql`
      UPDATE auto_comment_schedules
      SET account_id = ${accountId},
          keyword = ${keyword},
          comment_text = ${commentText},
          link_rotator = ${linkRotator || null},
          ai_enabled = ${aiEnabled},
          ai_provider = ${aiProvider},
          ai_api_key = ${aiApiKey || null},
          ai_prompt = ${aiPrompt || null},
          max_comments = ${maxComments},
          delay_seconds = ${delaySeconds},
          schedule_minutes = ${scheduleMinutes},
          next_run = ${nextRun},
          last_error = NULL
      WHERE id = ${id}
      RETURNING *
    `);
    return res.json({ ok: true, schedule: ((result as any).rows ?? [])[0] });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to update schedule." });
  }
});

router.post("/schedules/:id/toggle", async (req, res) => {
  try {
    await ensureAutoCommentSchedulesTable();
    const id = Number(req.params.id);
    const current = await db.execute(sql`SELECT * FROM auto_comment_schedules WHERE id = ${id}`);
    const schedule = ((current as any).rows ?? [])[0];
    if (!schedule) return res.status(404).json({ ok: false, error: "Schedule not found." });
    const nextActive = !schedule.is_active;
    const nextRun = nextActive ? new Date(Date.now() + Number(schedule.schedule_minutes) * 60_000) : null;
    const result = await db.execute(sql`
      UPDATE auto_comment_schedules
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
    await ensureAutoCommentSchedulesTable();
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM auto_comment_schedules WHERE id = ${id}`);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Failed to delete schedule." });
  }
});

export default router;
