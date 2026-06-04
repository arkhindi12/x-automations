import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AdminSidebar } from "@/components/admin-sidebar";
import {
  FiCheck,
  FiX,
  FiImage,
} from "react-icons/fi";

type Transaction = {
  id: number;
  userId: number;
  planId: number;
  amount: number;
  uniqueCode: number;
  totalAmount: number;
  status: string;
  proofImageUrl: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  userName: string | null;
  userEmail: string | null;
  planName: string | null;
};

export default function AdminTransactions() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewProof, setViewProof] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const fetchTransactions = () => {
    fetch("/api/payments/admin/transactions", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setTransactions(d.transactions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTransactions(); }, []);

  const handleAction = async (id: number, status: "approved" | "rejected", note?: string) => {
    setProcessingId(id);
    await fetch(`/api/payments/admin/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status, adminNote: note }),
    });
    setProcessingId(null);
    fetchTransactions();
  };

  const formatRupiah = (num: number) => "Rp " + num.toLocaleString("id-ID");

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    paid: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    approved: "bg-green-500/10 text-green-400 border-green-500/20",
    rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  };

  const pendingCount = transactions.filter((t) => t.status === "paid").length;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <AdminSidebar active="transactions" />

      <main className="ml-64 min-h-screen">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-gray-800/40 px-8 py-4">
          <h2 className="text-lg font-semibold">Transactions</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {pendingCount > 0 ? `${pendingCount} transaksi menunggu verifikasi` : "Semua transaksi sudah diproses"}
          </p>
        </header>

        <div className="p-8">
          {loading ? (
            <div className="text-gray-500 text-sm">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Belum ada transaksi.</div>
          ) : (
            <div className="space-y-4">
              {transactions.map((tx, i) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`rounded-xl border p-5 ${
                    tx.status === "paid" ? "border-blue-500/40 bg-blue-500/5" : "border-gray-800/60 bg-[#12121a]"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* User & Plan info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-gray-300">
                          {tx.userName?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{tx.userName || "Unknown"}</div>
                          <div className="text-xs text-gray-500">{tx.userEmail}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>Plan: <span className="text-white font-medium">{tx.planName}</span></span>
                        <span>ID: #{tx.id}</span>
                        <span>{new Date(tx.createdAt).toLocaleString("id-ID")}</span>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                      <div className="text-lg font-bold">{formatRupiah(tx.totalAmount)}</div>
                      <div className="text-xs text-gray-500">
                        {formatRupiah(tx.amount)} + <span className="text-blue-400">{tx.uniqueCode}</span>
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[tx.status] || ""}`}>
                        {tx.status}
                      </span>

                      {tx.proofImageUrl && (
                        <button
                          onClick={() => setViewProof(tx.proofImageUrl)}
                          className="p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                          title="Lihat bukti"
                        >
                          <FiImage className="w-4 h-4" />
                        </button>
                      )}

                      {tx.status === "paid" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(tx.id, "approved")}
                            disabled={processingId === tx.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 text-xs font-medium transition-colors"
                          >
                            <FiCheck className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => {
                              const note = prompt("Alasan reject (optional):");
                              handleAction(tx.id, "rejected", note || undefined);
                            }}
                            disabled={processingId === tx.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-medium transition-colors"
                          >
                            <FiX className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {tx.adminNote && (
                    <div className="mt-3 px-3 py-2 rounded-lg bg-gray-800/30 text-xs text-gray-400">
                      Admin note: {tx.adminNote}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Proof Image Modal */}
      {viewProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setViewProof(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-lg max-h-[80vh] rounded-xl overflow-hidden border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={viewProof} alt="Bukti Pembayaran" className="w-full h-full object-contain" />
          </motion.div>
        </div>
      )}
    </div>
  );
}
