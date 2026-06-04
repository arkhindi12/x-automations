import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AdminSidebar } from "@/components/admin-sidebar";
import {
  FiSearch,
  FiMoreVertical,
  FiShield,
  FiUserX,
  FiUserCheck,
  FiChevronDown,
} from "react-icons/fi";

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  plan: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function AdminUsers() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "user">("all");
  const [openMenu, setOpenMenu] = useState<number | null>(null);

  const fetchUsers = () => {
    fetch("/api/admin/users", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleRole = async (id: number, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    await fetch(`/api/admin/users/${id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: newRole }),
    });
    setOpenMenu(null);
    fetchUsers();
  };

  const toggleActive = async (id: number, isActive: boolean) => {
    await fetch(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !isActive }),
    });
    setOpenMenu(null);
    fetchUsers();
  };

  const updatePlan = async (id: number, plan: string) => {
    await fetch(`/api/admin/users/${id}/plan`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ plan }),
    });
    fetchUsers();
  };

  const filtered = users.filter((u) => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const planColors: Record<string, string> = {
    starter: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    pro: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    enterprise: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Sidebar */}
      <AdminSidebar active="users" />

      {/* Main Content */}
      <main className="ml-64 min-h-screen">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-gray-800/40 px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Users</h2>
            <p className="text-xs text-gray-500 mt-0.5">{users.length} total users</p>
          </div>
        </header>

        <div className="p-8">
          {/* Filters */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row gap-3 mb-6"
          >
            <div className="relative flex-1 max-w-md">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#12121a] border border-gray-800/60 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
            <div className="relative">
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value as any)}
                className="appearance-none px-4 py-2.5 pr-9 rounded-lg bg-[#12121a] border border-gray-800/60 text-sm text-gray-300 focus:outline-none focus:border-blue-500/50 transition-colors cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>
              <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </motion.div>

          {/* Table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl border border-gray-800/60 bg-[#12121a] overflow-hidden"
          >
            {loading ? (
              <div className="px-6 py-12 text-center text-gray-500 text-sm">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-500 text-sm">No users found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800/60 text-left">
                      <th className="px-6 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                      <th className="px-6 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                      <th className="px-6 py-3.5 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/40">
                    {filtered.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-800/20 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-gray-300">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-white">{u.name}</div>
                              <div className="text-xs text-gray-500">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            u.role === "admin"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              : "bg-gray-800/50 text-gray-400 border border-gray-700/50"
                          }`}>
                            {u.role === "admin" && <FiShield className="w-3 h-3" />}
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={u.plan || ""}
                            onChange={(e) => updatePlan(u.id, e.target.value)}
                            className={`appearance-none px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer focus:outline-none transition-colors ${
                              u.plan ? planColors[u.plan] || "bg-gray-800/50 text-gray-300 border-gray-700/50" : "bg-gray-800/50 text-gray-500 border-gray-700/50"
                            }`}
                          >
                            <option value="">No Plan</option>
                            <option value="starter">Starter</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            u.isActive
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? "bg-green-400" : "bg-red-400"}`} />
                            {u.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-xs">
                          {new Date(u.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="relative inline-block">
                            <button
                              onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                              className="p-2 rounded-lg hover:bg-gray-800/50 text-gray-400 hover:text-white transition-colors"
                            >
                              <FiMoreVertical className="w-4 h-4" />
                            </button>
                            {openMenu === u.id && (
                              <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-[#1a1a24] border border-gray-800/60 shadow-xl shadow-black/40 py-1.5 z-50">
                                <button
                                  onClick={() => toggleRole(u.id, u.role)}
                                  className="flex items-center gap-2.5 w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800/50 hover:text-white transition-colors"
                                >
                                  <FiShield className="w-3.5 h-3.5" />
                                  {u.role === "admin" ? "Demote to User" : "Promote to Admin"}
                                </button>
                                <button
                                  onClick={() => toggleActive(u.id, u.isActive)}
                                  className={`flex items-center gap-2.5 w-full px-4 py-2 text-left text-sm transition-colors ${
                                    u.isActive
                                      ? "text-red-400 hover:bg-red-500/10"
                                      : "text-green-400 hover:bg-green-500/10"
                                  }`}
                                >
                                  {u.isActive ? <FiUserX className="w-3.5 h-3.5" /> : <FiUserCheck className="w-3.5 h-3.5" />}
                                  {u.isActive ? "Disable Account" : "Enable Account"}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
