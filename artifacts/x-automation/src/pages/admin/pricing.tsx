import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AdminSidebar } from "@/components/admin-sidebar";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiStar,
  FiX,
  FiSave,
} from "react-icons/fi";

type Plan = {
  id: number;
  name: string;
  price: string;
  period: string;
  description: string | null;
  features: string;
  ctaText: string;
  isPopular: boolean;
  sortOrder: number;
  isActive: boolean;
};

const emptyPlan: Omit<Plan, "id"> = {
  name: "",
  price: "",
  period: "/bulan",
  description: "",
  features: "",
  ctaText: "Mulai Sekarang",
  isPopular: false,
  sortOrder: 0,
  isActive: true,
};

export default function AdminPricing() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<Plan, "id">>(emptyPlan);
  const [saving, setSaving] = useState(false);

  const fetchPlans = () => {
    fetch("/api/pricing/admin", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setPlans(d.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPlans(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyPlan, sortOrder: plans.length + 1 });
    setCreating(true);
  };

  const openEdit = (plan: Plan) => {
    setCreating(false);
    setEditing(plan);
    setForm({
      name: plan.name,
      price: plan.price,
      period: plan.period,
      description: plan.description || "",
      features: plan.features,
      ctaText: plan.ctaText,
      isPopular: plan.isPopular,
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
    });
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) {
        await fetch("/api/pricing/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
      } else if (editing) {
        await fetch(`/api/pricing/admin/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(form),
        });
      }
      closeForm();
      fetchPlans();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Hapus plan ini?")) return;
    await fetch(`/api/pricing/admin/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchPlans();
  };

  const togglePopular = async (plan: Plan) => {
    await fetch(`/api/pricing/admin/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isPopular: !plan.isPopular }),
    });
    fetchPlans();
  };

  const toggleActive = async (plan: Plan) => {
    await fetch(`/api/pricing/admin/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !plan.isActive }),
    });
    fetchPlans();
  };

  const showForm = creating || editing;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Sidebar */}
      <AdminSidebar active="pricing" />

      {/* Main Content */}
      <main className="ml-64 min-h-screen">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-gray-800/40 px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Pricing Plans</h2>
            <p className="text-xs text-gray-500 mt-0.5">Kelola harga dan fitur yang tampil di landing page</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors"
          >
            <FiPlus className="w-4 h-4" /> Tambah Plan
          </button>
        </header>

        <div className="p-8">
          {/* Plans Grid */}
          {loading ? (
            <div className="text-gray-500 text-sm">Loading...</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
              {plans.map((plan, i) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`relative rounded-xl border p-6 ${
                    plan.isActive
                      ? plan.isPopular
                        ? "border-blue-500/50 bg-gradient-to-b from-blue-500/5 to-transparent"
                        : "border-gray-800/60 bg-[#12121a]"
                      : "border-gray-800/30 bg-[#12121a]/50 opacity-60"
                  }`}
                >
                  {plan.isPopular && (
                    <div className="absolute -top-2.5 left-4 px-3 py-0.5 rounded-full bg-blue-600 text-xs font-medium">
                      Populer
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold">{plan.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => togglePopular(plan)} className={`p-1.5 rounded-lg transition-colors ${plan.isPopular ? "text-yellow-400 bg-yellow-500/10" : "text-gray-600 hover:text-yellow-400 hover:bg-yellow-500/10"}`}>
                        <FiStar className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openEdit(plan)} className="p-1.5 rounded-lg text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                        <FiEdit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(plan.id)} className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <span className="text-2xl font-bold">Rp {plan.price}</span>
                    <span className="text-gray-500 text-sm">{plan.period}</span>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {plan.features.split("\n").filter(Boolean).map((f, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-800/40">
                    <span className="text-xs text-gray-500">CTA: {plan.ctaText}</span>
                    <button
                      onClick={() => toggleActive(plan)}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${plan.isActive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                    >
                      {plan.isActive ? "Active" : "Inactive"}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Edit/Create Form Modal */}
          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeForm}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-lg rounded-2xl border border-gray-800/60 bg-[#12121a] p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">{creating ? "Tambah Plan Baru" : "Edit Plan"}</h3>
                  <button onClick={closeForm} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 transition-colors">
                    <FiX className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Nama Plan</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="Pro"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Harga</label>
                      <input
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="249K"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Periode</label>
                      <input
                        value={form.period}
                        onChange={(e) => setForm({ ...form, period: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50"
                        placeholder="/bulan"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Sort Order</label>
                      <input
                        type="number"
                        value={form.sortOrder}
                        onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                        className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Deskripsi</label>
                    <input
                      value={form.description || ""}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50"
                      placeholder="Cocok untuk pemula yang baru mulai."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Fitur (satu per baris)</label>
                    <textarea
                      value={form.features}
                      onChange={(e) => setForm({ ...form, features: e.target.value })}
                      rows={6}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50 font-mono resize-none"
                      placeholder={"5 Akun X\nUnlimited Target\nAuto Grab + Reply Scanner"}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">CTA Button Text</label>
                    <input
                      value={form.ctaText}
                      onChange={(e) => setForm({ ...form, ctaText: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-lg bg-[#0a0a0f] border border-gray-800/60 text-sm text-white focus:outline-none focus:border-blue-500/50"
                      placeholder="Mulai Sekarang"
                    />
                  </div>

                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isPopular}
                        onChange={(e) => setForm({ ...form, isPopular: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Tandai sebagai Populer</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Active</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800/40">
                  <button
                    onClick={closeForm}
                    className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.name || !form.price}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    <FiSave className="w-4 h-4" />
                    {saving ? "Menyimpan..." : "Simpan"}
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
