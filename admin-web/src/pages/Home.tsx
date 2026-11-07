import { useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  IndianRupee,
  MapPinned,
  MessageSquareWarning,
  Receipt,
  Store,
  Truck,
  UserCheck,
  Wallet,
} from "lucide-react";
import { api } from "../lib/api";
import { formatINR } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { usePlant } from "../context/PlantContext";
import { Card, Notice, StatCard } from "../components/ui/Card";

interface TodaySummary {
  staff: { total: number; onDuty: number; stationary: number };
  today: {
    orders: number;
    sales: number;
    visits: number;
    paymentsCount: number;
    paymentsTotal: number;
    newShops: number;
    farOrders: number;
  };
  waiting: {
    pendingOrders: number;
    oldestPendingAt: string | null;
    toDispatch: number;
    lateDeliveries: number;
    shopsWaiting: number;
    shopsDueToday: number;
    shopsOverdue: number;
    failedMessages: number;
  };
  dayEndsAt: string;
}

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

interface Task {
  key: string;
  icon: Icon;
  text: string;
  detail?: string;
  to: string;
  action: string;
  urgent?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function daysAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// What the office has to do, in the order it usually does it.
function tasks(s: TodaySummary): Task[] {
  const w = s.waiting;
  const list: Task[] = [];
  if (w.pendingOrders)
    list.push({
      key: "pending",
      icon: Receipt,
      text: `${plural(w.pendingOrders, "new order")} to confirm`,
      detail: w.oldestPendingAt ? `The oldest came in ${daysAgo(w.oldestPendingAt)}. The shop gets a thank-you SMS when you confirm.` : undefined,
      to: "/orders?tab=pending",
      action: "Confirm orders",
      urgent: !!w.oldestPendingAt && Date.now() - new Date(w.oldestPendingAt).getTime() > 2 * 86_400_000,
    });
  if (w.toDispatch)
    list.push({
      key: "dispatch",
      icon: Truck,
      text: `${plural(w.toDispatch, "confirmed order")} to send out`,
      detail: "Enter the vehicle and driver when the goods leave the plant.",
      to: "/orders?tab=confirmed",
      action: "Dispatch",
    });
  if (w.lateDeliveries)
    list.push({
      key: "late",
      icon: Clock,
      text: `${plural(w.lateDeliveries, "order")} on the way for more than 2 days`,
      detail: "Check with the driver and mark them delivered.",
      to: "/orders?tab=dispatched",
      action: "Check deliveries",
      urgent: true,
    });
  if (w.shopsWaiting)
    list.push({
      key: "shops",
      icon: Store,
      text: `${plural(w.shopsWaiting, "new shop")} added by salespeople, waiting for your approval`,
      detail: "Other salespeople see a shop only after you approve it.",
      to: "/stores",
      action: "Review shops",
    });
  if (w.shopsOverdue || w.shopsDueToday)
    list.push({
      key: "due",
      icon: CalendarClock,
      text: [w.shopsDueToday ? `${plural(w.shopsDueToday, "shop")} due for a visit today` : null, w.shopsOverdue ? `${w.shopsOverdue} overdue` : null]
        .filter(Boolean)
        .join(", "),
      detail: "Next-visit dates are set by salespeople when they leave a shop.",
      to: "/stores?due=1",
      action: "See shops",
      urgent: w.shopsOverdue > 0,
    });
  if (s.staff.stationary)
    list.push({
      key: "still",
      icon: MapPinned,
      text: `${plural(s.staff.stationary, "salesperson has", "salespeople have")} stayed in one place for over an hour`,
      detail: "They blink red on the live map.",
      to: "/live-map",
      action: "Open map",
    });
  if (s.today.farOrders)
    list.push({
      key: "far",
      icon: AlertTriangle,
      text: `${plural(s.today.farOrders, "order")} today marked "at the shop" but taken more than 300 m away`,
      detail: "Shown in red on the Orders page.",
      to: "/orders",
      action: "Check orders",
      urgent: true,
    });
  if (w.failedMessages)
    list.push({
      key: "sms",
      icon: MessageSquareWarning,
      text: `${plural(w.failedMessages, "SMS or WhatsApp message")} failed to send this week`,
      detail: "Usually a wrong number or the SMS account needs topping up.",
      to: "/messages",
      action: "See messages",
    });
  return list;
}

// Where each part of the console is, for people new to it.
const GUIDE: { to: string; title: string; text: string }[] = [
  { to: "/live-map", title: "Live map", text: "Where every salesperson on duty is right now." },
  { to: "/orders", title: "Orders", text: "Confirm, dispatch, deliver and print orders from the field." },
  { to: "/visits", title: "Shop visits", text: "Every shop check-in, payment collected and next visit date." },
  { to: "/stores", title: "Shops", text: "Shops on the map: add, import from Excel, approve new ones." },
  { to: "/products", title: "Products & prices", text: "Price list, your plant's prices and the colour shades." },
  { to: "/staff-attendance", title: "Attendance", text: "Who worked which day this month, in one grid." },
  { to: "/dashboard", title: "Sales reports", text: "Sales by district, product and salesperson over time." },
  { to: "/employees", title: "Salespeople", text: "Add staff, reset passwords, move them between districts." },
];

export function Home() {
  const { user } = useAuth();
  const { plant } = usePlant();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      api<TodaySummary>("/api/reports/today")
        .then((s) => live && setSummary(s))
        .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load today's summary"));
    load();
    // Keep the counts fresh while the page is left open in the office.
    const id = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [plant?.id]);

  const firstName = (user?.name ?? "").split(" ")[0];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const list = summary ? tasks(summary) : [];

  return (
    <div className="space-y-8">
      <div className="border-b border-neutral-200 pb-5">
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-neutral-500">
          <CalendarDays className="h-4 w-4" />
          {today}
          {plant ? ` · ${plant.name}` : " · all plants"}
        </p>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-neutral-900">Needs your attention</h2>
        {!summary ? (
          <div className="h-32 animate-pulse rounded-lg bg-neutral-200/60" />
        ) : list.length === 0 ? (
          <Card className="flex items-center gap-3 px-5 py-5">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <div className="font-medium text-neutral-900">All caught up</div>
              <div className="text-sm text-neutral-500">No orders to confirm or send out, and no shops waiting for approval.</div>
            </div>
          </Card>
        ) : (
          <Card className="divide-y divide-neutral-100">
            {list.map((t) => (
              <Link key={t.key} to={t.to} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-neutral-50">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    t.urgent ? "bg-red-50 text-red-700" : "bg-sand-100 text-brand-700"
                  }`}
                >
                  <t.icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-neutral-900">{t.text}</div>
                  {t.detail ? <div className="mt-0.5 text-[13px] text-neutral-500">{t.detail}</div> : null}
                </div>
                <span className="hidden shrink-0 items-center gap-1 text-[13px] font-medium text-brand-700 group-hover:underline sm:inline-flex">
                  {t.action}
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-neutral-900">Today so far</h2>
          {summary ? <span className="text-xs text-neutral-500">Duty ends for everyone at {summary.dayEndsAt}</span> : null}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Salespeople on duty"
            value={summary ? `${summary.staff.onDuty} of ${summary.staff.total}` : "-"}
            icon={UserCheck}
            hint={summary && summary.staff.onDuty === 0 ? "Nobody has started duty yet" : "See them on the live map"}
          />
          <StatCard
            label="Orders taken today"
            value={summary ? summary.today.orders : "-"}
            icon={Receipt}
            accent
            hint={summary ? (summary.today.orders ? `Worth ${formatINR(summary.today.sales)}` : "No orders yet today") : undefined}
          />
          <StatCard
            label="Shops visited today"
            value={summary ? summary.today.visits : "-"}
            icon={Store}
            hint={summary ? (summary.today.newShops ? `${plural(summary.today.newShops, "new shop")} added` : "No new shops added") : undefined}
          />
          <StatCard
            label="Money collected at shops"
            value={summary ? formatINR(summary.today.paymentsTotal) : "-"}
            icon={summary && summary.today.paymentsTotal > 0 ? Wallet : IndianRupee}
            hint={summary ? (summary.today.paymentsCount ? `From ${plural(summary.today.paymentsCount, "shop")}` : "Nothing collected yet") : undefined}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-neutral-900">Where to find things</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {GUIDE.map((g) => (
            <Link
              key={g.to}
              to={g.to}
              className="group rounded-lg border border-neutral-200 bg-white px-4 py-3.5 transition-colors hover:border-brand-600"
            >
              <div className="flex items-center justify-between text-[14px] font-semibold text-neutral-900">
                {g.title}
                <ChevronRight className="h-4 w-4 text-neutral-300 group-hover:text-brand-700" />
              </div>
              <div className="mt-1 text-[13px] leading-snug text-neutral-500">{g.text}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
