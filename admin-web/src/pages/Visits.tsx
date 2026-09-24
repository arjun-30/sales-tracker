import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Visit } from "../lib/types";
import { Card, Badge, PageHeader } from "../components/ui/Card";

export function Visits() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ visits: Visit[] }>("/api/visits")
      .then((d) => setVisits(d.visits))
      .finally(() => setLoading(false));
  }, []);

  function duration(v: Visit): string {
    if (!v.checkOutAt) return "In progress";
    const ms = new Date(v.checkOutAt).getTime() - new Date(v.checkInAt).getTime();
    const mins = Math.round(ms / 60000);
    return `${mins} min`;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Shop Visits" description="Every check-in and check-out made from the field, newest first." />
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Employee</th>
              <th className="px-5 py-3 font-medium">Shop</th>
              <th className="px-5 py-3 font-medium">District</th>
              <th className="px-5 py-3 font-medium">Check-in</th>
              <th className="px-5 py-3 font-medium">Check-out</th>
              <th className="px-5 py-3 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-5 py-10 text-center text-sm text-slate-400" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && visits.length === 0 && (
              <tr>
                <td className="px-5 py-10 text-center text-sm text-slate-400" colSpan={6}>
                  No visits yet.
                </td>
              </tr>
            )}
            {visits.map((v) => (
              <tr key={v.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                <td className="px-5 py-3">{v.employee.name}</td>
                <td className="px-5 py-3">{v.shopName}</td>
                <td className="px-5 py-3">{v.district.name}</td>
                <td className="px-5 py-3 text-slate-500">{new Date(v.checkInAt).toLocaleString()}</td>
                <td className="px-5 py-3 text-slate-500">
                  {v.checkOutAt ? new Date(v.checkOutAt).toLocaleString() : <Badge tone="yellow">Open</Badge>}
                </td>
                <td className="px-5 py-3">{duration(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
