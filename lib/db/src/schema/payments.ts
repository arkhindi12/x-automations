import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { pricingPlansTable } from "./pricing-plans";

export const paymentMethodsTable = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "qris" | "bank"
  name: text("name").notNull(),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  bankName: text("bank_name"),
  qrisImageUrl: text("qris_image_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => pricingPlansTable.id),
  paymentMethodId: integer("payment_method_id").references(() => paymentMethodsTable.id),
  amount: integer("amount").notNull(),
  uniqueCode: integer("unique_code").notNull(),
  totalAmount: integer("total_amount").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "paid" | "approved" | "rejected"
  proofImageUrl: text("proof_image_url"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;
export type Transaction = typeof transactionsTable.$inferSelect;
