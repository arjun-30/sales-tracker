import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from "@react-google-maps/api";
import { api } from "../lib/api";
import { formatINR, formatMinutes, formatTime } from "../lib/format";
import type { OrderStatus } from "../lib/types";
import { Card, CardHeader, Notice } from "./ui/Card";
import { Input } from "./ui/Input";

interface DayRoute {
  date: string;
  points: { lat: number; lng: number; at: string }[];
  stops: { lat: number; lng: number; from: string; to: string; minutes: number }[];
  distanceKm: number;
  orders: {
    id: string;
    customerName: string;
    shopName: string | null;
    totalAmount: number;
    status: OrderStatus;
    channel: "in_person" | "phone";
    distanceFromStoreM: number | null;
    lat: number | null;
    lng: number | null;
    createdAt: string;
  }[];
  visits: {
    id: string;
    shopName: string;
    checkInAt: string;
    checkOutAt: string | null;
    checkInLat: number;
    checkInLng: number;
  }[];
}

type Event =
  | { kind: "start" | "end"; at: string }
  | { kind: "stop"; at: string; to: string; minutes: number; index: number }
  | { kind: "order"; at: string; order: DayRoute["orders"][number] }
  | { kind: "visit"; at: string; visit: DayRoute["visits"][number] };

const COLOR_ROUTE = "#0047ab";
const COLOR_STOP = "#dc2626";
const COLOR_ORDER = "#15803d";
const COLOR_VISIT = "#d97706";

// A stop this long is flagged in the timeline.
const LONG_STOP_MINUTES = 60;

const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

function dot(color: string, scale = 7): google.maps.Symbol {
  return { path: google.maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 };
}

// One day of an employee's field work on a map: the route their phone
// reported, numbered stops of 15 minutes or more, orders and shop visits, with
// the same events as a timeline beside it.
export function EmployeeDayRoute({ code, initialDate }: { code: string; initialDate?: string }) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "" });
  const [date, setDate] = useState(initialDate ?? todayIst());
  const [route, setRoute] = useState<DayRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api<DayRoute>(`/api/employees/code/${encodeURIComponent(code)}/route?date=${date}`)
      .then((r) => live && setRoute(r))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not load the route"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [code, date]);

  const path = useMemo(() => route?.points.map((p) => ({ lat: p.lat, lng: p.lng })) ?? [], [route]);

  // Frame the whole day whenever a new one loads.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route) return;
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    route.orders.forEach((o) => o.lat !== null && o.lng !== null && bounds.extend({ lat: o.lat, lng: o.lng }));
    route.visits.forEach((v) => bounds.extend({ lat: v.checkInLat, lng: v.checkInLng }));
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
  }, [route, path, isLoaded]);

  const events = useMemo<Event[]>(() => {
    if (!route) return [];
    const list: Event[] = [
      ...route.stops.map((s, index) => ({ kind: "stop" as const, at: s.from, to: s.to, minutes: s.minutes, index })),
      ...route.orders.map((order) => ({ kind: "order" as const, at: order.createdAt, order })),
      ...route.visits.map((visit) => ({ kind: "visit" as const, at: visit.checkInAt, visit })),
    ];
    if (route.points.length) {
      list.push({ kind: "start", at: route.points[0].at });
      list.push({ kind: "end", at: route.points[route.points.length - 1].at });
    }
    return list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [route]);

  const longStops = route?.stops.filter((s) => s.minutes >= LONG_STOP_MINUTES).length ?? 0;
  const empty = route && route.points.length === 0 && route.orders.length === 0 && route.visits.length === 0;

  return (
    <Card>
      <CardHeader
        title="Day route"
        description={
          route && !empty
            ? `${route.distanceKm} km travelled · ${route.stops.length} stops of 15 min or more${longStops ? ` (${longStops} over an hour)` : ""} · ${route.orders.length} orders · ${route.visits.length} visits`
            : "Where the employee went on a day, from their phone's position while on duty."
        }
        actions={
          <Input type="date" value={date} max={todayIst()} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
        }
      />
      {error ? (
        <div className="p-5">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : (
        <div className={`grid lg:grid-cols-[1fr_320px] ${loading ? "opacity-60" : ""}`}>
          <div className="relative h-[440px] border-b border-neutral-200 lg:border-b-0 lg:border-r">
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={{ lat: 10.8284, lng: 78.7638 }}
                zoom={7}
                options={{ disableDefaultUI: true, zoomControl: true, clickableIcons: false }}
                onLoad={(map) => {
                  mapRef.current = map;
                }}
                onUnmount={() => {
                  mapRef.current = null;
                }}
              >
                {path.length > 1 ? (
                  <PolylineF path={path} options={{ strokeColor: COLOR_ROUTE, strokeOpacity: 0.85, strokeWeight: 4 }} />
                ) : null}
                {path.length > 0 ? (
                  <>
                    <MarkerF position={path[0]} icon={dot("#171717", 6)} title="Start" zIndex={20} />
                    <MarkerF position={path[path.length - 1]} icon={dot(COLOR_ROUTE, 8)} title="Last position" zIndex={20} />
                  </>
                ) : null}
                {route?.stops.map((s, i) => (
                  <MarkerF
                    key={`stop-${i}`}
                    position={{ lat: s.lat, lng: s.lng }}
                    icon={dot(COLOR_STOP, s.minutes >= LONG_STOP_MINUTES ? 13 : 10)}
                    label={{ text: String(i + 1), color: "#fff", fontSize: "10px", fontWeight: "700" }}
                    title={`Stop ${i + 1}: ${formatTime(s.from)}–${formatTime(s.to)} (${formatMinutes(s.minutes)})`}
                    zIndex={30}
                  />
                ))}
                {route?.visits.map((v) => (
                  <MarkerF
                    key={v.id}
                    position={{ lat: v.checkInLat, lng: v.checkInLng }}
                    icon={dot(COLOR_VISIT)}
                    title={`Visit: ${v.shopName} at ${formatTime(v.checkInAt)}`}
                    zIndex={40}
                  />
                ))}
                {route?.orders
                  .filter((o) => o.lat !== null && o.lng !== null)
                  .map((o) => (
                    <MarkerF
                      key={o.id}
                      position={{ lat: o.lat!, lng: o.lng! }}
                      icon={dot(COLOR_ORDER)}
                      title={`Order: ${o.shopName ?? o.customerName}, ${formatINR(o.totalAmount)} at ${formatTime(o.createdAt)}`}
                      zIndex={50}
                    />
                  ))}
              </GoogleMap>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">Loading map…</div>
            )}
            {empty ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-neutral-600">
                No route, orders or visits on this day.
              </div>
            ) : null}
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md border border-neutral-200 bg-white/95 px-3 py-1.5 text-xs text-neutral-600 shadow-sm">
              <Legend color={COLOR_ROUTE} label="Route" line />
              <Legend color={COLOR_STOP} label="Stop 15 min+" />
              <Legend color={COLOR_ORDER} label="Order" />
              <Legend color={COLOR_VISIT} label="Visit" />
            </div>
          </div>

          <ol className="max-h-[440px] divide-y divide-neutral-100 overflow-y-auto">
            {events.length === 0 && !loading ? (
              <li className="px-4 py-6 text-center text-sm text-neutral-500">Nothing recorded on this day.</li>
            ) : null}
            {events.map((e, i) => (
              <li key={i} className="flex gap-3 px-4 py-2.5">
                <span className="w-16 shrink-0 pt-0.5 text-xs tabular-nums text-neutral-500">{formatTime(e.at)}</span>
                <span className="min-w-0 flex-1 text-sm">
                  {e.kind === "start" ? <span className="text-neutral-500">First position of the day</span> : null}
                  {e.kind === "end" ? <span className="text-neutral-500">Last position of the day</span> : null}
                  {e.kind === "stop" ? (
                    <span className={e.minutes >= LONG_STOP_MINUTES ? "font-semibold text-red-700" : "text-neutral-800"}>
                      Stop {e.index + 1}: stayed {formatMinutes(e.minutes)}
                      <span className="block text-xs font-normal text-neutral-500">until {formatTime(e.to)}</span>
                    </span>
                  ) : null}
                  {e.kind === "order" ? (
                    <span className="text-neutral-800">
                      <span style={{ color: COLOR_ORDER }} className="font-medium">
                        Order
                      </span>{" "}
                      · {e.order.shopName ?? e.order.customerName} · {formatINR(e.order.totalAmount)}
                      <span className="block text-xs text-neutral-500">
                        {e.order.channel === "phone"
                          ? "By phone"
                          : e.order.distanceFromStoreM !== null
                            ? `At the shop · ${e.order.distanceFromStoreM} m away`
                            : "At the shop"}
                        {e.order.status === "cancelled" ? " · cancelled" : ""}
                      </span>
                    </span>
                  ) : null}
                  {e.kind === "visit" ? (
                    <span className="text-neutral-800">
                      <span style={{ color: COLOR_VISIT }} className="font-medium">
                        Visit
                      </span>{" "}
                      · {e.visit.shopName}
                      <span className="block text-xs text-neutral-500">
                        {e.visit.checkOutAt ? `Left at ${formatTime(e.visit.checkOutAt)}` : "Not checked out"}
                      </span>
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

function Legend({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={line ? "h-1 w-4 rounded-sm" : "h-2.5 w-2.5 rounded-full"} style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
