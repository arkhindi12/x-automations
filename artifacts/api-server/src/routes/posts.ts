import { Router } from "express";
import { db } from "@workspace/db";
import { postsTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreatePostBody, UpdatePostBody, UpdatePostParams, DeletePostParams } from "@workspace/api-zod";

const router = Router();

async function getPostWithAccount(id: number) {
  const [post] = await db.select({
    id: postsTable.id,
    accountId: postsTable.accountId,
    accountUsername: accountsTable.username,
    content: postsTable.content,
    insertLink: postsTable.insertLink,
    mediaId: postsTable.mediaId,
    scheduledAt: postsTable.scheduledAt,
    status: postsTable.status,
    postedAt: postsTable.postedAt,
    xPostId: postsTable.xPostId,
    createdAt: postsTable.createdAt,
  })
    .from(postsTable)
    .leftJoin(accountsTable, eq(postsTable.accountId, accountsTable.id))
    .where(eq(postsTable.id, id));
  return post;
}

router.get("/", async (_req, res) => {
  const posts = await db.select({
    id: postsTable.id,
    accountId: postsTable.accountId,
    accountUsername: accountsTable.username,
    content: postsTable.content,
    insertLink: postsTable.insertLink,
    mediaId: postsTable.mediaId,
    scheduledAt: postsTable.scheduledAt,
    status: postsTable.status,
    postedAt: postsTable.postedAt,
    xPostId: postsTable.xPostId,
    createdAt: postsTable.createdAt,
  })
    .from(postsTable)
    .leftJoin(accountsTable, eq(postsTable.accountId, accountsTable.id))
    .orderBy(postsTable.scheduledAt);
  res.json(posts);
});

router.post("/", async (req, res) => {
  const body = CreatePostBody.parse(req.body);
  const [post] = await db.insert(postsTable).values({
    ...body,
    scheduledAt: new Date(body.scheduledAt),
    status: "pending",
  }).returning();
  const full = await getPostWithAccount(post.id);
  res.status(201).json(full);
});

router.delete("/", async (_req, res) => {
  const deleted = await db.delete(postsTable).returning({ id: postsTable.id });
  res.json({ ok: true, deleted: deleted.length });
});

router.put("/:id", async (req, res) => {
  const { id } = UpdatePostParams.parse({ id: Number(req.params.id) });
  const body = UpdatePostBody.parse(req.body);
  const updateData: Record<string, unknown> = { ...body };
  if (body.scheduledAt) updateData.scheduledAt = new Date(body.scheduledAt);
  await db.update(postsTable).set(updateData).where(eq(postsTable.id, id));
  const post = await getPostWithAccount(id);
  if (!post) return res.status(404).json({ error: "Not found" });
  res.json(post);
});

router.delete("/:id", async (req, res) => {
  const { id } = DeletePostParams.parse({ id: Number(req.params.id) });
  await db.delete(postsTable).where(eq(postsTable.id, id));
  res.json({ ok: true });
});

export default router;
