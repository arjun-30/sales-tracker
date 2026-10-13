import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const fieldClasses =
  "h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 hover:border-neutral-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:bg-neutral-50";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClasses} ${className}`} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldClasses} pr-8 ${className}`} {...props} />;
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-neutral-700">
      {children}
      {hint ? <span className="text-xs font-normal text-neutral-400">{hint}</span> : null}
    </label>
  );
}
