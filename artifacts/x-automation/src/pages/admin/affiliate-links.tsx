import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AdminSidebar } from "@/components/admin-sidebar";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiX,
  FiSave,
  FiExternalLink,
  FiCopy,
} from "react-icons/fi";

type AffiliateLink = {
  id: number;
  code: string;
  name: string;
  destinationUrl: string;
  isActive: boolean;
  clicks: number;
  createdAt: string;
};

const emptyForm = {
  name: "",
  destinationUrl: "",
  code: "",
  isActive: true,
};

export default function AdminAffiliateLinks() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AffiliateLink | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchLinks = () => {
    fetch("/api/affiliate-links", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setLinks(d.links || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLinks(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setCreating(true);
  };

  const openEdit = (link: AffiliateLink) => {
    setCreating(false);
    setEditing(link);
    setForm({
      name: link.name,
      destinationUrl: link.destinationUrl,
      code: link.code,
      isActive: link.isActive,
    });
  };

  const closeForm = () => { setEditing(null); setCreating(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) {
        await fetch("/api/affiliate-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
      } else if (editing) {
        await fetch(`/api/affiliate-links/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: form.name, destinationUrl: form.destinationUrl, isActive: form.isActive }),
        });
      }
      closeForm();
      fetchLinks();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus affiliate link ini?")) return;
    await fetch(`/api/affiliate-links/${id}`, { method: "DELETE", credentials: "include" });
    fetchLinks();
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/r/${code}.mp4`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!user || user.role !== "admin") {
    navigate("/");
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[#030305]">
      <AdminSidebar active="affiliate" />
      <main className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-white">Affiliate Links</h1>
              <p className="text-xs text-gray-500 mt-0.5">Kelola link affiliate dengan redirect otomatis</p>
            </div>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors">
              <FiPlus className="w-4 h-4" /> Tambah Link
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500 font-mono">Loading...</div>
          ) : links.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-sm">Belum ada affiliate link.</p>
              <p className="text-xs mt-1 text-gray-600">Buat link pertama untuk mulai tracking clicks.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <div key={link.id} className="p-4 rounded-xl border border-gray-800/60 bg-[#0a0a0f] hover:border-gray-700/60 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white text-sm">{link.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${link.isActive ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>
                          {link.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <code className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded font-mono">/r/{link.code}.mp4</code>
                        <button onClick={() => copyLink(link.code)} className="text-gray-500 hover:text-white transition-colors" title="Copy link">
                          <FiCopy className="w-3.5 h-3.5" />
                        </button>
                        {copied === link.code && <span className="text-xs text-green-400">Copied!</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 truncate">
                        <FiExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{link.destinationUrl}</span>
                      </div>
                      <div className="mt-2 text-xs text-gray-600">
                        Clicks: <span className="text-white font-medium">{link.clicks}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(link)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
                        <FiEdit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(link.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors">
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info box */}
          <div className="mt-6 p-4 rounded-lg border border-gray-800/40 bg-[#0a0a0f]">
            <p className="text-xs text-gray-400 font-medium mb-2">Cara Pakai di Post Template:</p>
            <code className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded font-mono block">
              {"{caption}"}\n{"{affiliate}"}
            </code>
            <p className="text-xs text-gray-600 mt-2">
              Variable <code className="text-blue-400">{"{affiliate}"}</code> akan otomatis diganti dengan link redirect acak dari daftar di atas.
              Format: <code className="text-gray-400">https://domain.com/r/kode.mp4</code>
            </p>
          </div>

          {/* Create/Edit Modal */}
          {(creating || editing) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-[#0f0f14] border border-gray-800/60 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-semibold text-white">{creating ? "Tambah Affiliate Link" : "Edit Affiliate Link"}</h2>
                  <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><FiX className="w-4 h-4" /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Nama</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="Shopee Affiliate" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">URL Tujuan (Affiliate Link Asli)</label>
                    <input value={form.destinationUrl} onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50" placeholder="https://shope.ee/xxx" />
                  </div>
                  {creating && (
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Kode (opsional, auto-generate jika kosong)</label>
                      <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50 font-mono" placeholder="df8dsuhu" />
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-500" />
                    <span className="text-sm text-gray-300">Active</span>
                  </label>
                </div>
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800/40">
                  <button onClick={closeForm} className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors">Batal</button>
                  <button onClick={handleSave} disabled={saving || !form.name || !form.destinationUrl} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium transition-colors">
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
