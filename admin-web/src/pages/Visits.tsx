import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Visit } from "../lib/types";
import { Card, Badge } from "../components/ui/Card";

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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Visits</h1>
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Shop</th>
              <th className="px-4 py-2">District</th>
              <th className="px-4 py-2">Check-in</th>
              <th className="px-4 py-2">Check-out</th>
              <th className="px-4 py-2">Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && visits.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={6}>
                  No visits yet.
                </td>
              </tr>
            )}
            {visits.map((v) => (
              <tr key={v.id} className="border-b border-slate-100">
                <td className="px-4 py-2">{v.employee.name}</td>
                <td className="px-4 py-2">{v.shopName}</td>
                <td className="px-4 py-2">{v.district.name}</td>
                <td className="px-4 py-2 text-slate-500">{new Date(v.checkInAt).toLocaleString()}</td>
                <td className="px-4 py-2 text-slate-500">
                  {v.checkOutAt ? new Date(v.checkOutAt).toLocaleString() : <Badge tone="yellow">Open</Badge>}
                </td>
                <td className="px-4 py-2">{duration(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
