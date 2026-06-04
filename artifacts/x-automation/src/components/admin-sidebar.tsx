import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  FiHome,
  FiUsers,
  FiDollarSign,
  FiCreditCard,
  FiSettings,
  FiLogOut,
  FiLink,
} from "react-icons/fi";

export function AdminSidebar({ active }: { active: string }) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const links = [
    { href: "/admin", label: "Dashboard", icon: FiHome, key: "dashboard" },
    { href: "/admin/users", label: "Users", icon: FiUsers, key: "users" },
    { href: "/admin/pricing", label: "Pricing", icon: FiDollarSign, key: "pricing" },
    { href: "/admin/payments", label: "Payments", icon: FiCreditCard, key: "payments" },
    { href: "/admin/transactions", label: "Transactions", icon: FiDollarSign, key: "transactions" },
    { href: "/admin/affiliate-links", label: "Affiliate Links", icon: FiLink, key: "affiliate" },
    { href: "/dashboard", label: "App Dashboard", icon: FiSettings, key: "app" },
  ];

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0f0f18] border-r border-gray-800/60 flex flex-col z-50">
      <div className="p-6 border-b border-gray-800/60">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          X Automation
        </h1>
        <p className="text-xs text-gray-500 mt-1">Admin Panel</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => (
          <a
            key={link.key}
            href={link.href}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
              active === link.key
                ? "bg-blue-500/10 text-blue-400 font-medium"
                : "text-gray-400 hover:text-white hover:bg-gray-800/50"
            }`}
          >
            <link.icon className="w-4 h-4" /> {link.label}
          </a>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-800/60">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-xs text-gray-500 truncate">{user?.email}</div>
          </div>
        </div>
        <button
          onClick={() => { logout(); navigate("/"); }}
          className="flex items-center gap-2 w-full px-4 py-2 rounded-lg text-red-400 hover:bg-red-500/10 text-sm transition-colors"
        >
          <FiLogOut className="w-4 h-4" /> Logout
        </button>
      </div>
    </aside>
  );
}
