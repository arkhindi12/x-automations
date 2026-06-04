import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AdminSidebar } from "@/components/admin-sidebar";
import {
  FiUsers,
  FiFilm,
  FiActivity,
  FiDollarSign,
  FiTrendingUp,
  FiClock,
  FiUserCheck,
  FiDatabase,
  FiServer,
} from "react-icons/fi";

type Stats = {
  totalUsers: number;
  activeUsers: number;
  totalMedia: number;
  totalJobs: number;
  revenue: string;
};

type RecentUser = {
  id: number;
  name: string;
  email: string;
  plan: string | null;
  createdAt: string;
};

const fadeIn = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3 },
  }),
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [serverTime, setServerTime] = useState<string>("");

  useEffect(() => {
    fetch("/api/admin/stats", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});

    fetch("/api/admin/users", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setRecentUsers((d.users || []).slice(-5).reverse()))
      .catch(() => {});

    setServerTime(new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" }));
    const interval = setInterval(() => {
      setServerTime(new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" }));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    { label: "Total Users", value: stats?.totalUsers ?? "-", icon: FiUsers, color: "from-blue-500 to-blue-600", bgColor: "bg-blue-500/10", textColor: "text-blue-400" },
    { label: "Active Users", value: stats?.activeUsers ?? "-", icon: FiUserCheck, color: "from-green-500 to-green-600", bgColor: "bg-green-500/10", textColor: "text-green-400" },
    { label: "Total Media", value: stats?.totalMedia ?? "-", icon: FiFilm, color: "from-purple-500 to-purple-600", bgColor: "bg-purple-500/10", textColor: "text-purple-400" },
    { label: "Active Jobs", value: stats?.totalJobs ?? "-", icon: FiActivity, color: "from-orange-500 to-orange-600", bgColor: "bg-orange-500/10", textColor: "text-orange-400" },
    { label: "Revenue", value: stats?.revenue ?? "-", icon: FiDollarSign, color: "from-emerald-500 to-emerald-600", bgColor: "bg-emerald-500/10", textColor: "text-emerald-400" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Sidebar */}
      <AdminSidebar active="dashboard" />

      {/* Main Content */}
      <main className="ml-64 min-h-screen">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-gray-800/40 px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Dashboard</h2>
            <p className="text-xs text-gray-500 mt-0.5">{serverTime}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
              </span>
              <span className="text-xs text-green-400 font-medium">System Online</span>
            </div>
          </div>
        </header>

        <div className="p-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {statCards.map((card, i) => (
              <motion.div
                key={card.label}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={fadeIn}
                className="relative overflow-hidden rounded-xl border border-gray-800/60 bg-[#12121a] p-5 group hover:border-gray-700/60 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-lg ${card.bgColor} flex items-center justify-center`}>
                    <card.icon className={`w-5 h-5 ${card.textColor}`} />
                  </div>
                  <FiTrendingUp className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                </div>
                <div className="text-2xl font-bold tracking-tight">{card.value}</div>
                <div className="text-xs text-gray-500 mt-1">{card.label}</div>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${card.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
              </motion.div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Recent Users */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="lg:col-span-2 rounded-xl border border-gray-800/60 bg-[#12121a] overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-800/40 flex items-center justify-between">
                <h3 className="font-semibold text-sm">Recent Users</h3>
                <a href="/admin/users" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  View All
                </a>
              </div>
              <div className="divide-y divide-gray-800/40">
                {recentUsers.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500 text-sm">No users yet</div>
                ) : (
                  recentUsers.map((u) => (
                    <div key={u.id} className="px-6 py-3.5 flex items-center gap-4 hover:bg-gray-800/20 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-gray-700/50 flex items-center justify-center text-xs font-bold text-gray-300">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{u.name}</div>
                        <div className="text-xs text-gray-500 truncate">{u.email}</div>
                      </div>
                      <div className="text-right">
                        {u.plan ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {u.plan}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs text-gray-500 bg-gray-800/50">
                            Free
                          </span>
                        )}
                        <div className="text-xs text-gray-600 mt-1">
                          {new Date(u.createdAt).toLocaleDateString("id-ID")}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>

            {/* Quick Info & Actions */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="space-y-4"
            >
              {/* Server Info */}
              <div className="rounded-xl border border-gray-800/60 bg-[#12121a] p-5">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <FiServer className="w-4 h-4 text-gray-400" /> Server Info
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Status</span>
                    <span className="text-xs text-green-400 font-medium">Running</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Platform</span>
                    <span className="text-xs text-gray-300">Node.js + PM2</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Database</span>
                    <span className="text-xs text-gray-300">PostgreSQL</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Sessions</span>
                    <span className="text-xs text-gray-300">DB-backed</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="rounded-xl border border-gray-800/60 bg-[#12121a] p-5">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <FiClock className="w-4 h-4 text-gray-400" /> Quick Actions
                </h3>
                <div className="space-y-2">
                  <a
                    href="/admin/users"
                    className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-sm font-medium transition-colors"
                  >
                    <FiUsers className="w-4 h-4" /> Manage Users
                  </a>
                  <a
                    href="/dashboard"
                    className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 text-gray-300 text-sm font-medium transition-colors"
                  >
                    <FiDatabase className="w-4 h-4" /> App Dashboard
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
