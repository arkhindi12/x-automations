import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable, jobsTable, mediaTable, postsTable, activityTable } from "@workspace/db";
import { eq, count, sql, gte, and } from "drizzle-orm";

const router = Router();

router.get("/dashboard", async (_req, res) => {
  const [accountsCount] = await db.select({ count: count() }).from(accountsTable);
  const [activeJobsCount] = await db.select({ count: count() }).from(jobsTable).where(eq(jobsTable.isActive, true));
  const [totalMedia] = await db.select({ count: count() }).from(mediaTable);
  const [videosUploaded] = await db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.doodStatus, "done"));
  const [totalPosts] = await db.select({ count: count() }).from(postsTable).where(eq(postsTable.status, "posted"));
  const [pendingPosts] = await db.select({ count: count() }).from(postsTable).where(eq(postsTable.status, "pending"));

  const [imagesCount] = await db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.type, "image"));
  const [videosCount] = await db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.type, "video"));

  const [runningJobs] = await db.select({ count: count() }).from(jobsTable).where(eq(jobsTable.status, "running"));
  const [idleJobs] = await db.select({ count: count() }).from(jobsTable).where(eq(jobsTable.status, "idle"));
  const [errorJobs] = await db.select({ count: count() }).from(jobsTable).where(eq(jobsTable.status, "error"));

  res.json({
    totalAccounts: accountsCount.count,
    activeJobs: activeJobsCount.count,
    totalMediaGrabbed: totalMedia.count,
    totalVideosUploaded: videosUploaded.count,
    totalPostsMade: totalPosts.count,
    pendingPosts: pendingPosts.count,
    mediaByType: {
      images: imagesCount.count,
      videos: videosCount.count,
    },
    jobsByStatus: {
      active: runningJobs.count,
      idle: idleJobs.count,
      error: errorJobs.count,
    },
  });
});

router.get("/activity", async (_req, res) => {
  const items = await db.select().from(activityTable).orderBy(sql`${activityTable.createdAt} desc`).limit(20);
  res.json(items);
});

router.get("/charts", async (_req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const mediaRows = await db
    .select({
      day: sql<string>`to_char(${mediaTable.createdAt}, 'YYYY-MM-DD')`,
      type: mediaTable.type,
      doodStatus: mediaTable.doodStatus,
      count: count(),
    })
    .from(mediaTable)
    .where(gte(mediaTable.createdAt, sevenDaysAgo))
    .groupBy(
      sql`to_char(${mediaTable.createdAt}, 'YYYY-MM-DD')`,
      mediaTable.type,
      mediaTable.doodStatus,
    );

  const postsRows = await db
    .select({
      day: sql<string>`to_char(${postsTable.createdAt}, 'YYYY-MM-DD')`,
      status: postsTable.status,
      count: count(),
    })
    .from(postsTable)
    .where(gte(postsTable.createdAt, sevenDaysAgo))
    .groupBy(
      sql`to_char(${postsTable.createdAt}, 'YYYY-MM-DD')`,
      postsTable.status,
    );

  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }

  const mediaPerDay = days.map((day) => {
    const grabbed = mediaRows.filter((r) => r.day === day).reduce((sum, r) => sum + Number(r.count), 0);
    const doodSuccess = mediaRows.filter((r) => r.day === day && r.doodStatus === "done").reduce((sum, r) => sum + Number(r.count), 0);
    const doodFailed = mediaRows.filter((r) => r.day === day && r.doodStatus === "failed").reduce((sum, r) => sum + Number(r.count), 0);
    return { day, grabbed, doodSuccess, doodFailed };
  });

  const postsPerDay = days.map((day) => {
    const posted = postsRows.filter((r) => r.day === day && r.status === "posted").reduce((sum, r) => sum + Number(r.count), 0);
    const failed = postsRows.filter((r) => r.day === day && r.status === "failed").reduce((sum, r) => sum + Number(r.count), 0);
    const pending = postsRows.filter((r) => r.day === day && r.status === "pending").reduce((sum, r) => sum + Number(r.count), 0);
    return { day, posted, failed, pending };
  });

  const [doodDone] = await db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.doodStatus, "done"));
  const [doodFailed] = await db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.doodStatus, "failed"));
  const [doodUploading] = await db.select({ count: count() }).from(mediaTable).where(eq(mediaTable.doodStatus, "uploading"));

  res.json({
    mediaPerDay,
    postsPerDay,
    doodOverall: {
      done: doodDone.count,
      failed: doodFailed.count,
      uploading: doodUploading.count,
    },
  });
});

export default router;
