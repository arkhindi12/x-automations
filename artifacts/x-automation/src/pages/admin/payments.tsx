import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { AdminSidebar } from "@/components/admin-sidebar";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiX,
  FiSave,
  FiUpload,
} from "react-icons/fi";

type Method = {
  id: number;
  type: string;
  name: string;
  accountNumber: string | null;
  accountName: string | null;
  bankName: string | null;
  qrisImageUrl: string | null;
  isActive: boolean;
};

const emptyMethod = {
  type: "bank",
  name: "",
  accountNumber: "",
  accountName: "",
  bankName: "",
  qrisImageUrl: "",
  isActive: true,
};

export default function AdminPayments() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [methods, setMethods] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Method | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyMethod);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const qrisFileRef = useRef<HTMLInputElement>(null);

  const fetchMethods = () => {
    fetch("/api/payments/admin/methods", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setMethods(d.methods || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMethods(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyMethod });
    setCreating(true);
  };

  const openEdit = (m: Method) => {
    setCreating(false);
    setEditing(m);
    setForm({
      type: m.type,
      name: m.name,
      accountNumber: m.accountNumber || "",
      accountName: m.accountName || "",
      bankName: m.bankName || "",
      qrisImageUrl: m.qrisImageUrl || "",
      isActive: m.isActive,
    });
  };

  const closeForm = () => { setEditing(null); setCreating(false); };

  const handleQrisUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("qrisImage", file);
      const res = await fetch("/api/payments/admin/upload-qris", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (data.ok && data.url) {
        setForm((prev) => ({ ...prev, qrisImageUrl: data.url }));
      } else {
        alert(data.error || "Upload gagal");
      }
    } catch {
      alert("Upload gagal, coba lagi");
    }
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) {
        await fetch("/api/payments/admin/methods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
      } else if (editing) {
        await fetch(`/api/payments/admin/methods/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
      }
      closeForm();
      fetchMethods();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus metode pembayaran ini?")) return;
    await fetch(`/api/payments/admin/methods/${id}`, { method: "DELETE", credentials: "include" });
    fetchMethods();
  };

  const showForm = creating || editing;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <AdminSidebar active="payments" />

      <main className="ml-64 min-h-screen">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-gray-800/40 px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Payment Methods</h2>
            <p className="text-xs text-gray-500 mt-0.5">Setting QRIS dan rekening bank</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors">
            <FiPlus className="w-4 h-4" /> Tambah Metode
          </button>
        </header>

        <div className="p-8">
          {loading ? (
            <div className="text-gray-500 text-sm">Loading...</div>
          ) : methods.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Belum ada metode pembayaran. Klik "Tambah Metode" untuk mulai.</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {methods.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`rounded-xl border p-5 ${m.isActive ? "border-gray-800/60 bg-[#12121a]" : "border-gray-800/30 bg-[#12121a]/50 opacity-60"}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.type === "qris" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"}`}>
                        {m.type.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"><FiEdit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"><FiTrash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <h3 className="font-semibold mb-1">{m.name}</h3>
                  {m.type === "bank" && (
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div>{m.bankName} - {m.accountNumber}</div>
                      <div>a.n. {m.accountName}</div>
                    </div>
                  )}
                  {m.type === "qris" && m.qrisImageUrl && (
                    <img src={m.qrisImageUrl} alt="QRIS" className="w-24 h-24 mt-2 rounded bg-white p-1 object-contain" />
                  )}
                  <div className="mt-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${m.isActive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                      {m.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Form Modal */}
          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeForm}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md rounded-2xl border border-gray-800/60 bg-[#12121a] p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">{creating ? "Tambah Metode" : "Edit Metode"}</h3>
                  <button onClick={closeForm} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400"><FiX className="w-4 h-4" /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Tipe</label>
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50">
                      <option value="bank">Bank Transfer</option>
                      <option value="qris">QRIS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Nama Label</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="BCA / QRIS Dana" />
                  </div>
                  {form.type === "bank" && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Nama Bank</label>
                        <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="BCA" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">No. Rekening</label>
                        <input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="1234567890" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Atas Nama</label>
                        <input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="John Doe" />
                      </div>
                    </>
                  )}
                  {form.type === "qris" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">QRIS Image</label>
                      <div className="space-y-3">
                        {form.qrisImageUrl && (
                          <div className="relative inline-block">
                            <img src={form.qrisImageUrl} alt="QRIS Preview" className="w-32 h-32 rounded-lg bg-white p-1 object-contain border border-gray-700" />
                            <button
                              type="button"
                              onClick={() => setForm({ ...form, qrisImageUrl: "" })}
                              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs hover:bg-red-400"
                            >
                              <FiX className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            ref={qrisFileRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleQrisUpload(file);
                              e.target.value = "";
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => qrisFileRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-gray-300 hover:border-blue-500/50 hover:text-white transition-colors disabled:opacity-50"
                          >
                            <FiUpload className="w-4 h-4" />
                            {uploading ? "Uploading..." : form.qrisImageUrl ? "Ganti Gambar" : "Upload QRIS"}
                          </button>
                          {uploading && <span className="text-xs text-gray-500">Mengupload...</span>}
                        </div>
                        <p className="text-xs text-gray-600">PNG, JPG, atau WebP. Max 5MB.</p>
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-500" />
                    <span className="text-sm text-gray-300">Active</span>
                  </label>
                </div>
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800/40">
                  <button onClick={closeForm} className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors">Batal</button>
                  <button onClick={handleSave} disabled={saving || !form.name} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium transition-colors">
                    <FiSave className="w-4 h-4" /> {saving ? "Menyimpan..." : "Simpan"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
