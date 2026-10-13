import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  LogOut,
  MapPinned,
  Menu,
  Package,
  Receipt,
  Store,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

const navGroups: { label: string; items: { to: string; label: string; icon: LucideIcon; end?: boolean }[] }[] = [
  {
    label: "Monitor",
    items: [
      { to: "/", label: "Live Map", icon: MapPinned, end: true },
      { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
    ],
  },
  {
    label: "Sales",
    items: [
      { to: "/orders", label: "Orders", icon: Receipt },
      { to: "/visits", label: "Visits", icon: Store },
    ],
  },
  {
    label: "Manage",
    items: [
      { to: "/employees", label: "Employees", icon: Users },
      { to: "/products", label: "Products", icon: Package },
    ],
  },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  // The live map fills the whole content area instead of the padded column.
  const fullBleed = useLocation().pathname === "/";

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-950 text-slate-300">
      <div className="paint-stripe h-1 shrink-0" />
      <div className="px-5 pb-5 pt-6">
        <img src="/roalux-logo.png" alt="Roalux" className="h-11 w-auto" />
        <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sales admin</div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-white/10 text-white before:absolute before:inset-y-1.5 before:-left-3 before:w-1 before:rounded-r-full before:bg-brand-400"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user?.name}</div>
            <div className="text-xs text-slate-500">Administrator</div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="rounded-md p-2 text-slate-500 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">{sidebar}</aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-2xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen((o) => !o)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <img src="/roalux-logo.png" alt="Roalux" className="h-7 w-auto" />
        </header>
        {/* The live map is a full-bleed page; everything else sits in the padded column. */}
        {fullBleed ? (
          <main className="flex-1">
            <Outlet />
          </main>
        ) : (
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
