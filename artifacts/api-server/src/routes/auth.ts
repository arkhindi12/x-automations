import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, sessionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  maxAge: SESSION_MAX_AGE,
  path: "/",
  domain: ".x-auto.web.id",
};

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const verify = crypto.scryptSync(password, salt, 64).toString("hex");
  return hash === verify;
}

async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);
  await db.insert(sessionsTable).values({ id: token, userId, expiresAt });
  return token;
}

async function getSession(token: string): Promise<{ userId: number } | null> {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.id, token), gt(sessionsTable.expiresAt, new Date())));
  if (!session) return null;
  return { userId: session.userId };
}

async function deleteSession(token: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.id, token));
}

// Middleware to get current user
export async function getCurrentUser(req: any): Promise<any | null> {
  const token = req.cookies?.session || req.headers["x-session-token"];
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user || !user.isActive) return null;
  return user;
}

// Middleware: require auth
export function requireAuth(req: any, res: any, next: any) {
  getCurrentUser(req).then((user) => {
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: "Unauthorized" }));
}

// Middleware: require admin
export function requireAdmin(req: any, res: any, next: any) {
  getCurrentUser(req).then((user) => {
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  }).catch(() => res.status(401).json({ error: "Unauthorized" }));
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "Nama, email, dan password wajib diisi." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password minimal 6 karakter." });
    }

    // Check if email already exists
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    if (existing) {
      return res.status(400).json({ error: "Email sudah terdaftar." });
    }

    const passwordHash = hashPassword(password);

    // First user becomes admin
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM users`);
    const rows = (countResult as any).rows ?? countResult;
    const isFirstUser = Number(rows[0]?.count) === 0;

    const [user] = await db.insert(usersTable).values({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: isFirstUser ? "admin" : "user",
      isActive: true,
    }).returning();

    const token = await createSession(user.id);

    res.cookie("session", token, COOKIE_OPTIONS);

    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan, createdAt: user.createdAt },
    });
  } catch (error) {
    console.error("[AUTH] Register error:", error);
    return res.status(500).json({ error: "Registrasi gagal." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      return res.status(400).json({ error: "Email dan password wajib diisi." });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
    if (!user) {
      return res.status(401).json({ error: "Email atau password salah." });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Akun dinonaktifkan. Hubungi admin." });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Email atau password salah." });
    }

    const token = await createSession(user.id);

    res.cookie("session", token, COOKIE_OPTIONS);

    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan, createdAt: user.createdAt },
    });
  } catch (error) {
    console.error("[AUTH] Login error:", error);
    return res.status(500).json({ error: "Login gagal." });
  }
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan, createdAt: user.createdAt },
  });
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  const token = req.cookies?.session || req.headers["x-session-token"];
  if (token) await deleteSession(token);
  res.clearCookie("session", { path: "/", domain: ".x-auto.web.id" });
  return res.json({ ok: true });
});

export default router;
