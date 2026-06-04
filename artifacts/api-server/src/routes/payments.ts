import { Router } from "express";
import { db } from "@workspace/db";
import { paymentMethodsTable, transactionsTable, pricingPlansTable, usersTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { requireAuth, requireAdmin, getCurrentUser } from "./auth";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";

const router = Router();

// Ensure upload directories exist
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads/proofs");
const QRIS_UPLOAD_DIR = path.resolve(process.cwd(), "uploads/qris");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(QRIS_UPLOAD_DIR, { recursive: true });

// Multer config for QRIS image upload (max 5MB, images only)
const qrisUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, QRIS_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".png";
      cb(null, `qris-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PNG, JPG, and WebP images are allowed."));
  },
});

// ============ PUBLIC / USER ENDPOINTS ============

// GET /api/payments/methods - Get active payment methods
router.get("/methods", async (req, res) => {
  try {
    const methods = await db
      .select()
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.isActive, true))
      .orderBy(asc(paymentMethodsTable.id));
    return res.json({ methods });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch payment methods" });
  }
});

// POST /api/payments/checkout - Create transaction (user)
router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { planId, paymentMethodId } = req.body as { planId?: number; paymentMethodId?: number };

    if (!planId || !paymentMethodId) {
      return res.status(400).json({ error: "Plan dan metode pembayaran wajib dipilih." });
    }

    const [plan] = await db.select().from(pricingPlansTable).where(eq(pricingPlansTable.id, planId));
    if (!plan) return res.status(404).json({ error: "Plan tidak ditemukan." });

    const [method] = await db.select().from(paymentMethodsTable).where(eq(paymentMethodsTable.id, paymentMethodId));
    if (!method || !method.isActive) return res.status(404).json({ error: "Metode pembayaran tidak tersedia." });

    // Parse price (e.g. "99K" -> 99000, "249K" -> 249000, "1.5M" -> 1500000)
    const priceStr = plan.price.toUpperCase().replace(/[^0-9KMR.]/g, "");
    let amount = 0;
    if (priceStr.includes("M")) {
      amount = parseFloat(priceStr.replace("M", "")) * 1000000;
    } else if (priceStr.includes("K")) {
      amount = parseFloat(priceStr.replace("K", "")) * 1000;
    } else {
      amount = parseInt(priceStr) || 0;
    }

    if (amount <= 0) return res.status(400).json({ error: "Harga plan tidak valid." });

    // Generate unique code (3 digits: 100-999)
    const uniqueCode = Math.floor(Math.random() * 900) + 100;
    const totalAmount = amount + uniqueCode;

    const [transaction] = await db.insert(transactionsTable).values({
      userId: user.id,
      planId,
      paymentMethodId,
      amount,
      uniqueCode,
      totalAmount,
      status: "pending",
    }).returning();

    return res.json({
      transaction: {
        id: transaction.id,
        amount,
        uniqueCode,
        totalAmount,
        status: transaction.status,
        plan: { name: plan.name, price: plan.price, period: plan.period },
        paymentMethod: method,
      },
    });
  } catch (error) {
    console.error("[PAYMENTS] Checkout error:", error);
    return res.status(500).json({ error: "Gagal membuat transaksi." });
  }
});

// POST /api/payments/upload-proof/:id - Upload bukti bayar (user)
router.post("/upload-proof/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const txId = Number(req.params.id);

    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId));
    if (!tx || tx.userId !== user.id) return res.status(404).json({ error: "Transaksi tidak ditemukan." });
    if (tx.status !== "pending") return res.status(400).json({ error: "Transaksi sudah diproses." });

    // Handle base64 image upload
    const { image } = req.body as { image?: string };
    if (!image) return res.status(400).json({ error: "Bukti pembayaran wajib diupload." });

    // Extract base64 data
    const matches = image.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: "Format gambar tidak valid." });

    const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    const filename = `proof_${txId}_${crypto.randomBytes(8).toString("hex")}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    fs.writeFileSync(filepath, buffer);

    const proofImageUrl = `/uploads/proofs/${filename}`;

    await db.update(transactionsTable).set({
      proofImageUrl,
      status: "paid",
      updatedAt: new Date(),
    }).where(eq(transactionsTable.id, txId));

    return res.json({ ok: true, proofImageUrl });
  } catch (error) {
    console.error("[PAYMENTS] Upload proof error:", error);
    return res.status(500).json({ error: "Gagal upload bukti pembayaran." });
  }
});

// GET /api/payments/my-transactions - User's transactions
router.get("/my-transactions", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const txs = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, user.id))
      .orderBy(desc(transactionsTable.createdAt));

    return res.json({ transactions: txs });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// ============ ADMIN ENDPOINTS ============

// GET /api/payments/admin/methods - All payment methods
router.get("/admin/methods", requireAdmin, async (req, res) => {
  try {
    const methods = await db.select().from(paymentMethodsTable).orderBy(asc(paymentMethodsTable.id));
    return res.json({ methods });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch methods" });
  }
});

// POST /api/payments/admin/upload-qris - Upload QRIS image
router.post("/admin/upload-qris", requireAdmin, (req, res) => {
  qrisUpload.single("qrisImage")(req, res, (err) => {
    if (err) {
      const message = err instanceof multer.MulterError
        ? (err.code === "LIMIT_FILE_SIZE" ? "File terlalu besar (max 5MB)" : err.message)
        : err.message || "Upload gagal";
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = `/uploads/qris/${req.file.filename}`;
    return res.json({ ok: true, url });
  });
});

// POST /api/payments/admin/methods - Create payment method
router.post("/admin/methods", requireAdmin, async (req, res) => {
  try {
    const { type, name, accountNumber, accountName, bankName, qrisImageUrl } = req.body as {
      type?: string;
      name?: string;
      accountNumber?: string;
      accountName?: string;
      bankName?: string;
      qrisImageUrl?: string;
    };

    if (!type || !name) return res.status(400).json({ error: "Type dan name wajib diisi." });

    const [method] = await db.insert(paymentMethodsTable).values({
      type,
      name: name.trim(),
      accountNumber: accountNumber?.trim() || null,
      accountName: accountName?.trim() || null,
      bankName: bankName?.trim() || null,
      qrisImageUrl: qrisImageUrl?.trim() || null,
      isActive: true,
    }).returning();

    return res.json({ ok: true, method });
  } catch (error) {
    return res.status(500).json({ error: "Failed to create method" });
  }
});

// PATCH /api/payments/admin/methods/:id - Update payment method
router.patch("/admin/methods/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { type, name, accountNumber, accountName, bankName, qrisImageUrl, isActive } = req.body;

    const updates: Record<string, unknown> = {};
    if (type !== undefined) updates.type = type;
    if (name !== undefined) updates.name = name.trim();
    if (accountNumber !== undefined) updates.accountNumber = accountNumber?.trim() || null;
    if (accountName !== undefined) updates.accountName = accountName?.trim() || null;
    if (bankName !== undefined) updates.bankName = bankName?.trim() || null;
    if (qrisImageUrl !== undefined) updates.qrisImageUrl = qrisImageUrl?.trim() || null;
    if (isActive !== undefined) updates.isActive = isActive;

    await db.update(paymentMethodsTable).set(updates).where(eq(paymentMethodsTable.id, id));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update method" });
  }
});

// DELETE /api/payments/admin/methods/:id
router.delete("/admin/methods/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(paymentMethodsTable).where(eq(paymentMethodsTable.id, id));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete method" });
  }
});

// GET /api/payments/admin/transactions - All transactions
router.get("/admin/transactions", requireAdmin, async (req, res) => {
  try {
    const txs = await db
      .select({
        id: transactionsTable.id,
        userId: transactionsTable.userId,
        planId: transactionsTable.planId,
        paymentMethodId: transactionsTable.paymentMethodId,
        amount: transactionsTable.amount,
        uniqueCode: transactionsTable.uniqueCode,
        totalAmount: transactionsTable.totalAmount,
        status: transactionsTable.status,
        proofImageUrl: transactionsTable.proofImageUrl,
        adminNote: transactionsTable.adminNote,
        createdAt: transactionsTable.createdAt,
        updatedAt: transactionsTable.updatedAt,
        userName: usersTable.name,
        userEmail: usersTable.email,
        planName: pricingPlansTable.name,
      })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .leftJoin(pricingPlansTable, eq(transactionsTable.planId, pricingPlansTable.id))
      .orderBy(desc(transactionsTable.createdAt));

    return res.json({ transactions: txs });
  } catch (error) {
    console.error("[PAYMENTS] Admin transactions error:", error);
    return res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// PATCH /api/payments/admin/transactions/:id - Approve/reject transaction
router.patch("/admin/transactions/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, adminNote } = req.body as { status?: string; adminNote?: string };

    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status harus approved atau rejected." });
    }

    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
    if (!tx) return res.status(404).json({ error: "Transaksi tidak ditemukan." });

    await db.update(transactionsTable).set({
      status,
      adminNote: adminNote || null,
      updatedAt: new Date(),
    }).where(eq(transactionsTable.id, id));

    // If approved, update user's plan
    if (status === "approved") {
      const [plan] = await db.select().from(pricingPlansTable).where(eq(pricingPlansTable.id, tx.planId));
      if (plan) {
        await db.update(usersTable).set({ plan: plan.name.toLowerCase() }).where(eq(usersTable.id, tx.userId));
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update transaction" });
  }
});

export default router;
