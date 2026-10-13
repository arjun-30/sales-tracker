import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataF, GoogleMap, InfoWindowF, MarkerF, PolygonF, useJsApiLoader } from "@react-google-maps/api";
import { Crosshair, MapPin, WifiOff } from "lucide-react";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import type { District, EmployeeLocation } from "../lib/types";
import { Select } from "../components/ui/Input";

const TAMIL_NADU_CENTER = { lat: 10.8284, lng: 78.7638 };
const containerStyle = { width: "100%", height: "100%" };

// Bounding box of the TN districts geojson, padded slightly so state edges
// aren't flush against the map edge.
const TN_BOUNDS = { north: 13.75, south: 7.9, west: 76.05, east: 80.55 };

// Panning is locked to a box around the state so the admin can't wander off.
// It has to be wider than the state itself: with strictBounds Google zooms in
// until the whole viewport fits inside it, which on a wide screen would crop
// Tamil Nadu. The mask below hides everything in the margin anyway.
const TN_RESTRICTION_BOUNDS = { north: 16.5, south: 5.5, west: 71, east: 86.5 };

// Everything outside Tamil Nadu is painted over with this, so the state reads
// as the only land on the map.
const MASK_COLOR = "#ececec";

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  clickableIcons: false,
  keyboardShortcuts: false,
  // Lets fitBounds land between whole zoom levels so the state fills the
  // screen instead of snapping to a size that's either cropped or tiny.
  isFractionalZoomEnabled: true,
  backgroundColor: MASK_COLOR,
  minZoom: 6,
  maxZoom: 18,
  restriction: { latLngBounds: TN_RESTRICTION_BOUNDS, strictBounds: true },
  // Google's standard road styling stays (highways, main roads, streets and
  // their names); only clutter that doesn't help a sales manager is hidden.
  styles: [
    { featureType: "administrative.country", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "administrative.province", stylers: [{ visibility: "off" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  ],
};

const DISTRICT_NAME_ALIASES: Record<string, string> = {
  kanniyakumari: "kanyakumari",
  thiruvallur: "tiruvallur",
  thiruvarur: "tiruvarur",
  tuticorin: "thoothukudi",
  villupuram: "viluppuram",
};

// The public/tn-districts.geojson boundary file spells some district names
// differently (older census names) than the seeded `District.name` values.
function normalizeDistrictName(name: string): string {
  const stripped = name.trim().toLowerCase().replace(/^the\s+/, "").replace(/[^a-z]/g, "");
  return DISTRICT_NAME_ALIASES[stripped] ?? stripped;
}

// An employee marker older than this is shown dimmed/grey — the sales app can
// go quiet (background throttling, dead zone) well before an explicit
// "off duty" event ever arrives, and admins need to be able to tell the two
// apart on the map.
const STALE_AFTER_MS = 10 * 60 * 1000;

// Past this the "on duty" flag is no longer believable: the app was most
// likely killed or the phone died without ever sending "off duty". Such
// employees are taken off the map and out of the on-duty count, and listed
// as offline instead.
const OFFLINE_AFTER_MS = 2 * 60 * 60 * 1000;

const COLOR_ACTIVE = "#6d4bb3";
const COLOR_STALE = "#a3a3a3";

type Status = "active" | "stale" | "offline";

function statusOf(updatedAt: string, now: number): Status {
  const age = now - new Date(updatedAt).getTime();
  return age > OFFLINE_AFTER_MS ? "offline" : age > STALE_AFTER_MS ? "stale" : "active";
}

interface LiveEntry {
  employeeId: string;
  name: string;
  districtId: string | null;
  lat: number;
  lng: number;
  onDuty: boolean;
  updatedAt: string;
}

// public/tn-mask.json: `outer` is a frame far beyond the pan restriction and
// `tn` holds the state's outline rings (mainland + islands), wound opposite
// to the frame so Google Maps cuts them out as holes.
interface TnMask {
  outer: google.maps.LatLngLiteral[];
  tn: google.maps.LatLngLiteral[][];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function timeAgo(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function LiveMap() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "",
  });

  const [districts, setDistricts] = useState<District[]>([]);
  const [districtFilter, setDistrictFilter] = useState("");
  const [entries, setEntries] = useState<Record<string, LiveEntry>>({});
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [geoReady, setGeoReady] = useState(false);
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [mask, setMask] = useState<TnMask | null>(null);

  const mapRef = useRef<google.maps.Map | null>(null);
  const dataLayerRef = useRef<google.maps.Data | null>(null);
  const districtsRef = useRef<District[]>([]);
  useEffect(() => {
    districtsRef.current = districts;
  }, [districts]);

  useEffect(() => {
    fetch("/tn-mask.json")
      .then((r) => r.json())
      .then((data: TnMask) => setMask(data))
      .catch((err) => console.error("[LiveMap] failed to load tn-mask.json", err));
  }, []);

  // Re-check marker staleness periodically even when no new socket events
  // arrive, so a marker visibly fades once its last update ages past the
  // threshold rather than only updating on the next unrelated re-render.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api<{ districts: District[] }>("/api/districts").then((d) => setDistricts(d.districts));

    api<{ locations: EmployeeLocation[] }>("/api/tracking/live").then((d) => {
      const next: Record<string, LiveEntry> = {};
      for (const loc of d.locations) {
        if (!loc.user) continue;
        next[loc.userId] = {
          employeeId: loc.userId,
          name: loc.user.name,
          districtId: loc.user.districtId,
          lat: loc.lat,
          lng: loc.lng,
          onDuty: loc.onDuty,
          updatedAt: loc.updatedAt,
        };
      }
      setEntries(next);
    });

    const socket = connectSocket();
    const onLocation = (payload: LiveEntry) => {
      setEntries((prev) => ({ ...prev, [payload.employeeId]: { ...prev[payload.employeeId], ...payload } }));
    };
    const onDuty = (payload: LiveEntry) => {
      setEntries((prev) => {
        if (!payload.onDuty) {
          const next = { ...prev };
          delete next[payload.employeeId];
          return next;
        }
        return { ...prev, [payload.employeeId]: { ...prev[payload.employeeId], ...payload } };
      });
    };
    socket.on("employee:location", onLocation);
    socket.on("employee:duty", onDuty);
    return () => {
      socket.off("employee:location", onLocation);
      socket.off("employee:duty", onDuty);
    };
  }, []);

  const visibleEntries = useMemo(
    () =>
      Object.values(entries)
        .filter((e) => !districtFilter || e.districtId === districtFilter)
        .map((e) => ({ ...e, status: statusOf(e.updatedAt, now) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [entries, districtFilter, now]
  );

  const onMap = useMemo(() => visibleEntries.filter((e) => e.status !== "offline"), [visibleEntries]);
  const offline = useMemo(() => visibleEntries.filter((e) => e.status === "offline"), [visibleEntries]);
  const activeCount = onMap.filter((e) => e.status === "active").length;
  const staleCount = onMap.length - activeCount;

  const districtNameById = useMemo(() => new Map(districts.map((d) => [d.id, d.name])), [districts]);

  const onSelectEmployee = useCallback((id: string) => {
    setSelectedEmployee((cur) => (cur === id ? null : id));
  }, []);

  const focusEmployee = useCallback((e: LiveEntry) => {
    setSelectedEmployee(e.employeeId);
    const map = mapRef.current;
    if (!map) return;
    map.panTo({ lat: e.lat, lng: e.lng });
    if ((map.getZoom() ?? 0) < 13) map.setZoom(13);
  }, []);

  // The selected employee can vanish from the map (goes off duty or offline)
  // without ever passing back through onSelectEmployee, which would otherwise
  // leave a dangling InfoWindow reference for an id that no longer renders a
  // marker.
  useEffect(() => {
    if (selectedEmployee && !onMap.some((e) => e.employeeId === selectedEmployee)) setSelectedEmployee(null);
  }, [selectedEmployee, onMap]);

  const selectedDistrictName = useMemo(
    () => districts.find((d) => d.id === districtFilter)?.name ?? null,
    [districts, districtFilter]
  );

  const styleDistrict = useCallback(
    (feature: google.maps.Data.Feature): google.maps.Data.StyleOptions => {
      const dtname = feature.getProperty("dtname") as string | undefined;
      const norm = dtname ? normalizeDistrictName(dtname) : null;
      const isSelected = !!norm && !!selectedDistrictName && norm === normalizeDistrictName(selectedDistrictName);
      const isHovered = !isSelected && !!norm && !!hoveredDistrict && norm === hoveredDistrict;
      return {
        fillColor: COLOR_ACTIVE,
        fillOpacity: isSelected ? 0.08 : isHovered ? 0.06 : 0,
        strokeColor: isSelected ? "#6d4bb3" : isHovered ? "#4a3559" : "#737373",
        strokeWeight: isSelected ? 2.5 : isHovered ? 1.5 : 0.7,
        strokeOpacity: isSelected ? 1 : isHovered ? 0.9 : 0.45,
        zIndex: isSelected ? 4 : isHovered ? 3 : 2,
        clickable: true,
      };
    },
    [selectedDistrictName, hoveredDistrict]
  );

  useEffect(() => {
    dataLayerRef.current?.setStyle(styleDistrict);
  }, [styleDistrict]);

  const onDataLoad = useCallback((data: google.maps.Data) => {
    dataLayerRef.current = data;
    fetch("/tn-districts.geojson")
      .then((r) => r.json())
      .then((geojson) => {
        data.addGeoJson(geojson);
        data.setStyle(styleDistrict);
        setGeoReady(true);

        if (import.meta.env.DEV) {
          const seeded = new Set(districtsRef.current.map((d) => normalizeDistrictName(d.name)));
          const unmatched = (geojson.features as { properties?: Record<string, unknown> }[])
            .map((f) => f.properties?.dtname as string | undefined)
            .filter((dtname): dtname is string => !!dtname && !seeded.has(normalizeDistrictName(dtname)));
          if (unmatched.length > 0) {
            console.warn(
              "[LiveMap] tn-districts.geojson has district names with no seeded match — add an alias in DISTRICT_NAME_ALIASES:",
              unmatched
            );
          }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDataClick = useCallback(
    (e: google.maps.Data.MouseEvent) => {
      const dtname = e.feature.getProperty("dtname") as string | undefined;
      if (!dtname) return;
      const norm = normalizeDistrictName(dtname);
      const match = districts.find((d) => normalizeDistrictName(d.name) === norm);
      if (match) setDistrictFilter((cur) => (cur === match.id ? "" : match.id));
    },
    [districts]
  );

  const onDataMouseOver = useCallback((e: google.maps.Data.MouseEvent) => {
    const dtname = e.feature.getProperty("dtname") as string | undefined;
    setHoveredDistrict(dtname ? normalizeDistrictName(dtname) : null);
  }, []);

  const onDataMouseOut = useCallback(() => setHoveredDistrict(null), []);

  useEffect(() => {
    const map = mapRef.current;
    const dataLayer = dataLayerRef.current;
    if (!map || !dataLayer || !geoReady) return;

    if (!selectedDistrictName) {
      map.fitBounds(TN_BOUNDS, 24);
      return;
    }

    const targetNorm = normalizeDistrictName(selectedDistrictName);
    const bounds = new google.maps.LatLngBounds();
    let found = false;
    dataLayer.forEach((feature) => {
      const dtname = feature.getProperty("dtname") as string | undefined;
      if (dtname && normalizeDistrictName(dtname) === targetNorm) {
        found = true;
        feature.getGeometry()?.forEachLatLng((latLng) => bounds.extend(latLng));
      }
    });
    if (found) map.fitBounds(bounds, 48);
  }, [selectedDistrictName, geoReady]);

  const resetView = useCallback(() => {
    setSelectedEmployee(null);
    if (districtFilter) setDistrictFilter("");
    else mapRef.current?.fitBounds(TN_BOUNDS, 24);
  }, [districtFilter]);

  const where = selectedDistrictName ?? "Tamil Nadu";

  return (
    <div className="flex flex-col lg:flex-row">
      <div className="relative h-[calc(100vh-57px)] flex-1 lg:h-screen" style={{ backgroundColor: MASK_COLOR }}>
        {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500">
            Set VITE_GOOGLE_MAPS_API_KEY in admin-web/.env to load the map.
          </div>
        ) : isLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={TAMIL_NADU_CENTER}
            zoom={7}
            options={MAP_OPTIONS}
            onLoad={(map) => {
              mapRef.current = map;
              map.fitBounds(TN_BOUNDS, 24);
            }}
            onUnmount={() => {
              mapRef.current = null;
            }}
            onClick={() => setSelectedEmployee(null)}
          >
            {mask && (
              <>
                {/* Hides every neighbouring state, the sea and Sri Lanka. A
                    Data layer polygon rather than PolygonF: Data.Polygon
                    treats every ring after the first as a hole regardless of
                    winding, which PolygonF does not reliably do. */}
                <DataF
                  onLoad={(layer) => {
                    layer.add({ geometry: new google.maps.Data.Polygon([mask.outer, ...mask.tn]) });
                    layer.setStyle({
                      fillColor: MASK_COLOR,
                      fillOpacity: 1,
                      strokeWeight: 0,
                      clickable: false,
                      zIndex: 1,
                    });
                  }}
                />
                {/* Soft halo, then a crisp line, for the state border. */}
                <PolygonF
                  paths={mask.tn}
                  options={{
                    fillOpacity: 0,
                    strokeColor: "#404040",
                    strokeOpacity: 0.12,
                    strokeWeight: 8,
                    clickable: false,
                    zIndex: 5,
                  }}
                />
                <PolygonF
                  paths={mask.tn}
                  options={{
                    fillOpacity: 0,
                    strokeColor: "#404040",
                    strokeOpacity: 0.8,
                    strokeWeight: 1.5,
                    clickable: false,
                    zIndex: 6,
                  }}
                />
              </>
            )}
            <DataF
              onLoad={onDataLoad}
              onClick={onDataClick}
              onMouseOver={onDataMouseOver}
              onMouseOut={onDataMouseOut}
            />
            {onMap.map((e) => {
              const isStale = e.status === "stale";
              const isSelected = selectedEmployee === e.employeeId;
              return (
                <MarkerF
                  key={e.employeeId}
                  position={{ lat: e.lat, lng: e.lng }}
                  onClick={() => onSelectEmployee(e.employeeId)}
                  title={e.name}
                  zIndex={isSelected ? 1000 : isStale ? 10 : 100}
                  label={{ text: initials(e.name), color: "#ffffff", fontSize: "10px", fontWeight: "600" }}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: isSelected ? 15 : 13,
                    fillColor: isStale ? COLOR_STALE : COLOR_ACTIVE,
                    fillOpacity: 1,
                    strokeColor: isSelected ? "#2e1f3a" : "#ffffff",
                    strokeWeight: isSelected ? 3 : 2.5,
                  }}
                >
                  {isSelected && (
                    <InfoWindowF position={{ lat: e.lat, lng: e.lng }} onCloseClick={() => setSelectedEmployee(null)}>
                      <div className="min-w-40 space-y-1 p-1 text-sm">
                        <div className="font-semibold text-neutral-900">{e.name}</div>
                        {e.districtId && (
                          <div className="text-xs text-neutral-500">{districtNameById.get(e.districtId)}</div>
                        )}
                        <div className={isStale ? "text-xs font-medium text-amber-600" : "text-xs text-neutral-500"}>
                          {isStale ? "No signal since" : "Updated"} {timeAgo(e.updatedAt, now)}
                        </div>
                      </div>
                    </InfoWindowF>
                  )}
                </MarkerF>
              );
            })}
          </GoogleMap>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">Loading map…</div>
        )}

        {isLoaded && (
          <>
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur">
              {onMap.length > 0 ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
              )}
              <span className="text-sm text-neutral-700">
                {onMap.length > 0 ? (
                  <>
                    <span className="font-semibold text-neutral-900">{onMap.length}</span> on duty in {where}
                  </>
                ) : (
                  <>Nobody on duty in {where}</>
                )}
              </span>
            </div>

            <button
              onClick={resetView}
              className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs font-medium text-neutral-700 shadow-md backdrop-blur transition hover:bg-white hover:text-neutral-900"
            >
              <Crosshair className="h-3.5 w-3.5" />
              {selectedDistrictName ? "All of Tamil Nadu" : "Recenter"}
            </button>

            <div className="pointer-events-none absolute bottom-6 left-4 z-10 flex items-center gap-4 rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs text-neutral-600 shadow-md backdrop-blur">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLOR_ACTIVE }} />
                Active
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLOR_STALE }} />
                No signal 10+ min
              </span>
            </div>
          </>
        )}
      </div>

      <aside className="flex w-full flex-col border-t border-neutral-200 bg-white lg:h-screen lg:w-80 lg:border-l lg:border-t-0">
        <div className="space-y-3 border-b border-neutral-100 px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Live Map</h1>
            <p className="text-xs text-neutral-500">Real-time positions of field sales staff.</p>
          </div>
          <Select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}>
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Active" value={activeCount} tone="text-brand-600" />
            <Stat label="No signal" value={staleCount} tone="text-neutral-500" />
            <Stat label="Offline" value={offline.length} tone="text-neutral-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {onMap.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <MapPin className="h-6 w-6 text-neutral-300" />
              <div className="text-sm font-medium text-neutral-700">Nobody on duty</div>
              <div className="text-xs text-neutral-500">Salespeople appear here once they start duty in the app.</div>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {onMap.map((e) => {
                const isStale = e.status === "stale";
                const isSelected = selectedEmployee === e.employeeId;
                return (
                  <li key={e.employeeId}>
                    <button
                      onClick={() => focusEmployee(e)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                        isSelected ? "bg-brand-50" : "hover:bg-neutral-50"
                      }`}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        style={{ backgroundColor: isStale ? COLOR_STALE : COLOR_ACTIVE }}
                      >
                        {initials(e.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-900">{e.name}</span>
                        <span className="block truncate text-xs text-neutral-500">
                          {(e.districtId && districtNameById.get(e.districtId)) || "No district"}
                        </span>
                      </span>
                      <span className={`shrink-0 text-[11px] ${isStale ? "text-amber-600" : "text-neutral-400"}`}>
                        {timeAgo(e.updatedAt, now)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {offline.length > 0 && (
            <div className="border-t border-neutral-100">
              <div className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                <WifiOff className="h-3 w-3" />
                Offline · not reporting for 2+ hours
              </div>
              <ul>
                {offline.map((e) => (
                  <li key={e.employeeId} className="flex items-center gap-3 px-4 py-2 opacity-70">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-500">
                      {initials(e.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-700">{e.name}</span>
                      <span className="block truncate text-xs text-neutral-400">
                        {(e.districtId && districtNameById.get(e.districtId)) || "No district"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-neutral-400">Last seen {timeAgo(e.updatedAt, now)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-2 py-2">
      <div className={`text-lg font-semibold leading-none ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] text-neutral-500">{label}</div>
    </div>
  );
}
