import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  Clock,
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
    label: "Overview",
    items: [
      { to: "/", label: "Live Map", icon: MapPinned, end: true },
      { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
    ],
  },
  {
    label: "Sales",
    items: [
      { to: "/orders", label: "Orders", icon: Receipt },
      { to: "/visits", label: "Shop Visits", icon: Store },
      { to: "/products", label: "Products & Prices", icon: Package },
    ],
  },
  {
    label: "Team",
    items: [
      { to: "/employees", label: "Employees", icon: Users },
      { to: "/attendance", label: "Attendance", icon: Clock },
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
    <div className="flex h-full flex-col bg-[#1c1c1c] text-neutral-300">
      <div className="paint-stripe h-[3px] shrink-0" />
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.08] px-5">
        <img src="/roalux-logo.png" alt="Roalux" className="h-8 w-auto" />
        <div className="h-6 w-px bg-white/15" />
        <div className="text-[13px] font-semibold leading-tight text-white">
          Sales
          <br />
          <span className="font-normal text-neutral-400">Console</span>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `relative flex h-9 items-center gap-3 rounded-md px-3 text-[13.5px] transition-colors ${
                      isActive
                        ? "bg-white/[0.08] font-semibold text-white before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r before:bg-brand-500"
                        : "font-medium text-neutral-400 hover:bg-white/[0.04] hover:text-white"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`h-[17px] w-[17px] ${isActive ? "text-brand-400" : "text-neutral-500"}`} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.08] p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-white">{user?.name}</div>
            <div className="text-xs text-neutral-500">Administrator</div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            className="rounded-md p-2 text-neutral-500 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">{sidebar}</aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-neutral-900/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Menu"
            className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100"
          >
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
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-[1400px]">
              <Outlet />
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
