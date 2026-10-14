import type { ComponentType, ReactNode } from "react";
import { Check, CheckCheck, Clock, XCircle } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-neutral-200 bg-white ${className}`}>{children}</div>;
}

export function CardHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
      <div>
        <h2 className="text-[15px] font-semibold text-neutral-900">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-neutral-500">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

// A headline number: icon tile, label, the figure, and an optional one-line
// hint. Cards in a row stay the same height whether or not they have a hint.
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  hint?: ReactNode;
  // The figure that matters most on the page gets a filled cobalt tile.
  accent?: boolean;
}) {
  return (
    <Card className="flex items-start gap-4 px-5 py-4">
      {Icon ? (
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            accent ? "bg-brand-600 text-white" : "bg-sand-100 text-brand-700"
          }`}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-neutral-500">{label}</div>
        <div className="mt-1 truncate text-[24px] font-semibold leading-tight tracking-tight text-neutral-900 tabular-nums">
          {value}
        </div>
        <div className="mt-0.5 min-h-[18px] truncate text-xs text-neutral-500">{hint ?? " "}</div>
      </div>
    </Card>
  );
}

export type StatusTone = "neutral" | "green" | "amber" | "red" | "blue";

const markerColor: Record<StatusTone, string> = {
  neutral: "bg-neutral-400",
  green: "bg-emerald-600",
  amber: "bg-amber-500",
  red: "bg-red-600",
  blue: "bg-sky-600",
};

// Status as plain text with a small square marker, so tables read like a
// report rather than a row of coloured pills.
export function Status({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-medium text-neutral-800">
      <span className={`h-2 w-2 shrink-0 rounded-[2px] ${markerColor[tone]}`} />
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "error" | "warn"; children: ReactNode }) {
  const styles = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-red-200 bg-red-50 text-red-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return <div className={`rounded-md border px-4 py-2.5 text-sm ${styles}`}>{children}</div>;
}

// Underlined tabs for filtering a list (status, period). Counts are optional.
export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-neutral-200">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-brand-600 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={`text-xs tabular-nums ${active ? "text-brand-600" : "text-neutral-400"}`}>{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// Joined buttons for a small fixed choice, such as a date range.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-neutral-300 bg-white">
      {options.map((o, i) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 px-3 text-[13px] font-medium transition-colors ${i > 0 ? "border-l border-neutral-300" : ""} ${
            o.value === value ? "bg-brand-600 text-white" : "text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const orderStatus = {
  pending: { label: "Pending", icon: Clock, color: "text-amber-600" },
  confirmed: { label: "Confirmed", icon: Check, color: "text-sky-700" },
  delivered: { label: "Delivered", icon: CheckCheck, color: "text-emerald-700" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-red-600" },
} as const;

// Order status as an icon and a word, the same as the sales app: a clock while
// waiting, one tick once confirmed, two when delivered, a cross if cancelled.
export function OrderStatusLabel({ status }: { status: keyof typeof orderStatus }) {
  const s = orderStatus[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium ${s.color}`}>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
      {s.label}
    </span>
  );
}
