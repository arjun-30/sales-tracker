import type { ComponentType, ReactNode } from "react";

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

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  hint?: ReactNode;
  // The one figure on a page that matters most gets the Roalux red rule.
  accent?: boolean;
  tone?: string;
}) {
  return (
    <Card className={`relative overflow-hidden px-5 py-4 ${accent ? "border-t-2 border-t-brand-600" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13px] font-medium text-neutral-500">{label}</div>
        {Icon ? <Icon className="h-4 w-4 text-neutral-400" /> : null}
      </div>
      <div className="mt-2 truncate text-[26px] font-semibold leading-none tracking-tight text-neutral-900 tabular-nums">
        {value}
      </div>
      {hint ? <div className="mt-2 text-xs text-neutral-500">{hint}</div> : null}
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
