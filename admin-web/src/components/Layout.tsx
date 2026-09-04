import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Live Map", end: true },
  { to: "/orders", label: "Orders" },
  { to: "/visits", label: "Visits" },
  { to: "/employees", label: "Employees" },
  { to: "/products", label: "Products" },
  { to: "/dashboard", label: "Dashboard" },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="text-lg font-semibold text-slate-900">Paint Tracker</div>
          <div className="text-xs text-slate-500">Admin Panel</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 text-sm font-medium text-slate-700">{user?.name}</div>
          <button
            onClick={logout}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
