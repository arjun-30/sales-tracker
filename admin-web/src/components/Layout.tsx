import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  Building2,
  Clock,
  Factory,
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
import { usePlant } from "../context/PlantContext";

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; superOnly?: boolean };

const navGroups: { label: string; items: NavItem[] }[] = [
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
      { to: "/stores", label: "Stores", icon: Building2 },
      { to: "/products", label: "Products & Prices", icon: Package },
    ],
  },
  {
    label: "Team",
    items: [
      { to: "/employees", label: "Employees", icon: Users },
      { to: "/attendance", label: "Attendance", icon: Clock },
      { to: "/plants", label: "Plants & Admins", icon: Factory, superOnly: true },
    ],
  },
];

// The super admin picks which plant every page shows; a plant admin sees the
// name of theirs.
function PlantSwitcher() {
  const { isSuperAdmin, plants, plantId, plant, selectPlant } = usePlant();
  if (!isSuperAdmin) {
    return (
      <div className="rounded-md border border-sand-200 bg-white/60 px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-sand-500">Plant</div>
        <div className="truncate text-[13.5px] font-semibold text-sand-900">{plant?.name ?? "—"}</div>
      </div>
    );
  }
  return (
    <label className="block">
      <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-sand-500">Viewing</span>
      <select
        value={plantId}
        onChange={(e) => selectPlant(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-sand-300 bg-white px-2.5 text-[13.5px] font-semibold text-sand-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
      >
        <option value="">All plants</option>
        {plants.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.code})
          </option>
        ))}
      </select>
    </label>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { isSuperAdmin, plantId, plant } = usePlant();
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
    <div className="flex h-full flex-col border-r border-sand-200 bg-sand-100 text-sand-700">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sand-200 px-5">
        <img src="/roalux-logo.png" alt="Roalux" className="h-8 w-auto" />
        <div className="h-6 w-px bg-sand-300" />
        <div className="text-[13px] font-semibold leading-tight text-sand-900">
          Sales
          <br />
          <span className="font-normal text-sand-500">Console</span>
        </div>
      </div>

      <div className="border-b border-sand-200 px-3 py-3">
        <PlantSwitcher />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sand-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items
                .filter((item) => isSuperAdmin || !item.superOnly)
                .map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `relative flex h-9 items-center gap-3 rounded-md px-3 text-[13.5px] transition-colors ${
                      isActive
                        ? "bg-white font-semibold text-sand-900 shadow-[0_1px_2px_rgba(47,39,31,0.06)] before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r before:bg-brand-600"
                        : "font-medium text-sand-700 hover:bg-sand-200/60 hover:text-sand-900"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`h-[17px] w-[17px] ${isActive ? "text-brand-600" : "text-sand-500"}`} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sand-200 p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-sand-900">{user?.name}</div>
            <div className="truncate text-xs text-sand-500">
              {isSuperAdmin ? "Super admin" : `Plant admin${plant ? ` · ${plant.code}` : ""}`}
            </div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            className="rounded-md p-2 text-sand-500 transition-colors hover:bg-sand-200 hover:text-sand-900"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-sand-50">
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
            <Outlet key={plantId} />
          </main>
        ) : (
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {/* Keyed by plant so every page reloads its data when the super admin switches plant. */}
            <div className="mx-auto max-w-[1400px]">
              <Outlet key={plantId} />
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
