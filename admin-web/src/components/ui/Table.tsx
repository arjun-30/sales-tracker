import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className = "", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`whitespace-nowrap border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 first:pl-5 last:pr-5 ${className}`}
      {...props}
    />
  );
}

export function Td({ className = "", ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-4 py-3 align-top text-neutral-700 first:pl-5 last:pr-5 ${className}`} {...props} />;
}

export function Tr({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50/80 ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </tr>
  );
}

// One full-width row for loading and empty states.
export function MessageRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-sm text-neutral-500">
        {children}
      </td>
    </tr>
  );
}
