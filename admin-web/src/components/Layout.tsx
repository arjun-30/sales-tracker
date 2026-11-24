import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  House,
  Clock,
  Factory,
  LogOut,
  MapPinned,
  MessageSquare,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptIndianRupee,
  Store,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { usePlant } from "../context/PlantContext";
import { api } from "../lib/api";

// Fired by the Stores page after an approve or reject, so the count updates at once.
export const STORES_CHANGED = "stores:changed";

// Shops salespeople added from the field that still need an admin's approval.
function usePendingStores(plantId: string, pathname: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const load = () =>
      api<{ stores: { status: string }[] }>("/api/stores")
        .then((d) => setCount(d.stores.filter((s) => s.status === "pending").length))
        .catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener(STORES_CHANGED, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(STORES_CHANGED, load);
    };
  }, [plantId, pathname]);
  return count;
}

// hint: what the page is for, shown when hovering the link.
type NavItem = { to: string; label: string; hint: string; icon: LucideIcon; end?: boolean; superOnly?: boolean };

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Today", hint: "What needs doing and how today is going", icon: House, end: true },
      { to: "/live-map", label: "Live map", hint: "Where every salesperson on duty is right now", icon: MapPinned },
      { to: "/dashboard", label: "Sales reports", hint: "Sales by district, product and salesperson", icon: BarChart3 },
    ],
  },
  {
    label: "Orders & shops",
    items: [
      { to: "/orders", label: "Orders", hint: "Confirm, dispatch, deliver and print orders", icon: ReceiptIndianRupee },
      { to: "/visits", label: "Shop visits", hint: "Check-ins, payments collected and next visits", icon: Store },
      { to: "/stores", label: "Shops", hint: "Shops on the map; approve ones added in the field", icon: Building2 },
      { to: "/products", label: "Products & prices", hint: "Price list, plant prices and colour shades", icon: Package },
      { to: "/messages", label: "SMS & WhatsApp", hint: "Every message sent to shop owners and admins", icon: MessageSquare },
    ],
  },
  {
    label: "Team",
    items: [
      { to: "/employees", label: "Salespeople", hint: "Add staff, reset passwords, change district", icon: Users },
      { to: "/staff-attendance", label: "Attendance", hint: "Who worked which day this month", icon: CalendarCheck },
      { to: "/attendance", label: "Day history", hint: "One salesperson: route, stops, orders and hours", icon: Clock },
      { to: "/plants", label: "Plants & admins", hint: "Plants and their admin logins", icon: Factory, superOnly: true },
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
        <div className="truncate text-[13.5px] font-semibold text-sand-900">{plant?.name ?? "-"}</div>
      </div>
    );
  }
  return (
    <label className="block">
      <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-sand-500">Viewing</span>
      <select
        value={plantId}
        onChange={(e) => selectPlant(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-sand-300 bg-white px-2.5 text-[13.5px] font-semibold text-sand-900 outline-none focus:border-neutral-900"
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
  // Desktop: the sidebar slides down to an icon strip and back. Remembered per browser.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("pt_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("pt_sidebar_collapsed", c ? "0" : "1");
      } catch {
        /* private window: just don't remember */
      }
      return !c;
    });
  const { pathname } = useLocation();
  // Close the phone drawer when the page changes.
  useEffect(() => setOpen(false), [pathname]);
  // The live map fills the whole content area instead of the padded column.
  const fullBleed = pathname === "/live-map";
  const pendingStores = usePendingStores(plantId, pathname);

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // compact = the desktop icon strip; the phone drawer is always full width.
  const renderSidebar = (compact: boolean, onToggle?: () => void) => (
    <div className="flex h-full flex-col overflow-hidden border-r border-sand-200 bg-sand-100 text-sand-700">
      <div
        className={`flex h-16 shrink-0 items-center border-b border-sand-200 ${
          compact ? "justify-center px-2" : "gap-3 px-5"
        }`}
      >
        {compact ? null : (
          <>
            <img src="/roalux-logo.png" alt="Roalux" className="h-8 w-auto" />
            <div className="h-6 w-px bg-sand-300" />
            <div className="whitespace-nowrap text-[13px] font-semibold leading-tight text-sand-900">
              Sales
              <br />
              <span className="font-normal text-sand-500">Console</span>
            </div>
          </>
        )}
        {onToggle ? (
          <button
            onClick={onToggle}
            title={compact ? "Open the sidebar" : "Close the sidebar"}
            aria-label={compact ? "Open the sidebar" : "Close the sidebar"}
            className={`rounded-md p-2 text-sand-500 transition-colors hover:bg-sand-200 hover:text-sand-900 ${
              compact ? "" : "ml-auto -mr-2"
            }`}
          >
            {compact ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
        ) : null}
      </div>

      {compact ? null : (
        <div className="border-b border-sand-200 px-3 py-3">
          <PlantSwitcher />
        </div>
      )}

      <nav className={`flex-1 space-y-6 overflow-y-auto overflow-x-hidden py-5 ${compact ? "px-2" : "px-3"}`}>
        {navGroups.map((group, i) => (
          <div key={group.label}>
            {compact ? (
              i > 0 ? <div className="mx-auto mb-2 h-px w-6 bg-sand-300" /> : null
            ) : (
              <div className="whitespace-nowrap px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sand-500">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items
                .filter((item) => isSuperAdmin || !item.superOnly)
                .map(({ to, label, hint, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={compact ? `${label}: ${hint}` : hint}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `relative flex h-9 items-center rounded-md text-[13.5px] transition-colors ${
                      compact ? "justify-center px-0" : "gap-3 px-3"
                    } ${
                      isActive
                        ? `bg-white font-semibold text-sand-900 shadow-[0_1px_2px_rgba(47,39,31,0.06)] ${
                            compact
                              ? ""
                              : "before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-r before:bg-brand-600"
                          }`
                        : "font-medium text-sand-700 hover:bg-sand-200/60 hover:text-sand-900"
                    }`
                  }
                >
                  {({ isActive }) => {
                    const badge = to === "/stores" && pendingStores > 0;
                    const badgeTitle = `${pendingStores} ${pendingStores === 1 ? "shop" : "shops"} waiting for approval`;
                    return (
                      <>
                        <Icon className={`h-[17px] w-[17px] shrink-0 ${isActive ? "text-brand-600" : "text-sand-500"}`} />
                        {compact ? null : <span className="whitespace-nowrap">{label}</span>}
                        {badge && compact ? (
                          <span
                            title={badgeTitle}
                            className="absolute right-1.5 top-1 h-2.5 w-2.5 rounded-full border-2 border-sand-100 bg-brand-600"
                          />
                        ) : null}
                        {badge && !compact ? (
                          <span
                            title={badgeTitle}
                            className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold leading-none text-white tabular-nums"
                          >
                            {pendingStores}
                          </span>
                        ) : null}
                      </>
                    );
                  }}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={`border-t border-sand-200 ${compact ? "p-2" : "p-3"}`}>
        <div className={`flex items-center rounded-md ${compact ? "flex-col gap-1 py-1" : "gap-3 px-2 py-1.5"}`}>
          <div
            title={compact ? user?.name : undefined}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-xs font-semibold text-white"
          >
            {initials}
          </div>
          {compact ? null : (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-sand-900">{user?.name}</div>
              <div className="truncate text-xs text-sand-500">
                {isSuperAdmin ? "Super admin" : `Plant admin${plant ? ` · ${plant.code}` : ""}`}
              </div>
            </div>
          )}
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
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 transition-[width] duration-200 ease-out lg:block ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {renderSidebar(collapsed, toggleCollapsed)}
      </aside>

      {/* Phone / tablet: the sidebar slides in from the left over the page. */}
      <div className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-neutral-900/30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute inset-y-0 left-0 w-64 shadow-xl transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {renderSidebar(false)}
        </div>
      </div>

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
