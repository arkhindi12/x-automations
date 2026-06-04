import { Router } from "express";
import { db } from "@workspace/db";
import { targetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateTargetBody, DeleteTargetParams } from "@workspace/api-zod";

const router = Router();

router.get("/", async (_req, res) => {
  const targets = await db.select().from(targetsTable).orderBy(targetsTable.createdAt);
  res.json(targets);
});

router.post("/", async (req, res) => {
  const body = CreateTargetBody.parse(req.body);
  const existing = await db.select().from(targetsTable).where(eq(targetsTable.xUsername, body.xUsername));
  if (existing.length > 0) {
    return res.status(409).json({ error: "Target already exists" });
  }
  const [target] = await db.insert(targetsTable).values({
    xUsername: body.xUsername,
    mediaCount: 0,
  }).returning();
  res.status(201).json(target);
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteTargetParams.parse({ id: Number(req.params.id) });
  await db.delete(targetsTable).where(eq(targetsTable.id, id));
  res.json({ ok: true });
});

export default router;
