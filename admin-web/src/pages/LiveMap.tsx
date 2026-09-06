import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataF, GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import type { District, EmployeeLocation } from "../lib/types";
import { Select } from "../components/ui/Input";
import { Card } from "../components/ui/Card";

const TAMIL_NADU_CENTER = { lat: 10.8284, lng: 78.7638 };
const containerStyle = { width: "100%", height: "calc(100vh - 3rem)" };

// Bounding box of the TN districts geojson, padded slightly so state edges
// aren't flush against the map edge.
const TN_BOUNDS = { north: 13.75, south: 7.9, west: 76.05, east: 80.55 };

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  fullscreenControl: true,
  clickableIcons: false,
  styles: [
    { elementType: "geometry", stylers: [{ color: "#f5f7fa" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
    { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
    { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
    { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
    { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f1f5f9" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dbe4ee" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbeafe" }] },
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

interface LiveEntry {
  employeeId: string;
  name: string;
  districtId: string | null;
  lat: number;
  lng: number;
  onDuty: boolean;
  updatedAt: string;
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

  const mapRef = useRef<google.maps.Map | null>(null);
  const dataLayerRef = useRef<google.maps.Data | null>(null);
  const districtsRef = useRef<District[]>([]);
  useEffect(() => {
    districtsRef.current = districts;
  }, [districts]);

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
    () => Object.values(entries).filter((e) => !districtFilter || e.districtId === districtFilter),
    [entries, districtFilter]
  );

  const onSelectEmployee = useCallback((id: string) => {
    setSelectedEmployee((cur) => (cur === id ? null : id));
  }, []);

  // The selected employee can vanish from `entries` (goes off duty) without
  // ever passing back through onSelectEmployee, which would otherwise leave
  // a dangling InfoWindow reference for an id that no longer renders a marker.
  useEffect(() => {
    if (selectedEmployee && !entries[selectedEmployee]) setSelectedEmployee(null);
  }, [selectedEmployee, entries]);

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
        fillColor: "#2563eb",
        fillOpacity: isSelected ? 0.15 : isHovered ? 0.08 : 0,
        strokeColor: isSelected ? "#1d4ed8" : isHovered ? "#60a5fa" : "#94a3b8",
        strokeWeight: isSelected ? 3 : isHovered ? 2 : 1,
        strokeOpacity: isSelected ? 1 : isHovered ? 0.9 : 0.5,
        zIndex: isSelected ? 2 : isHovered ? 1.5 : 1,
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
      map.fitBounds(TN_BOUNDS);
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
    if (found) map.fitBounds(bounds);
  }, [selectedDistrictName, geoReady]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Live Map</h1>
        <div className="w-56">
          <Select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}>
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
        <Card className="border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
          Set VITE_GOOGLE_MAPS_API_KEY in admin-web/.env to load the map.
        </Card>
      )}

      <Card className="relative overflow-hidden">
        {isLoaded && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
            <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{visibleEntries.length}</span>{" "}
                employee{visibleEntries.length === 1 ? "" : "s"} on duty
                {selectedDistrictName ? ` in ${selectedDistrictName}` : ""}
              </span>
            </div>
            {selectedDistrictName && (
              <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
                <span className="h-2.5 w-3.5 rounded-sm border-2 border-blue-700 bg-blue-600/15" />
                {selectedDistrictName} boundary
                <button
                  onClick={() => setDistrictFilter("")}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        )}
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={TAMIL_NADU_CENTER}
            zoom={7}
            options={MAP_OPTIONS}
            onLoad={(map) => {
              mapRef.current = map;
              map.fitBounds(TN_BOUNDS);
            }}
            onUnmount={() => {
              mapRef.current = null;
            }}
          >
            <DataF
              onLoad={onDataLoad}
              onClick={onDataClick}
              onMouseOver={onDataMouseOver}
              onMouseOut={onDataMouseOut}
            />
            {visibleEntries.map((e) => {
              const isStale = now - new Date(e.updatedAt).getTime() > STALE_AFTER_MS;
              return (
                <MarkerF
                  key={e.employeeId}
                  position={{ lat: e.lat, lng: e.lng }}
                  onClick={() => onSelectEmployee(e.employeeId)}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 9,
                    fillColor: isStale ? "#94a3b8" : "#2563eb",
                    fillOpacity: isStale ? 0.6 : 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 2.5,
                  }}
                >
                  {selectedEmployee === e.employeeId && (
                    <InfoWindowF
                      position={{ lat: e.lat, lng: e.lng }}
                      onCloseClick={() => setSelectedEmployee(null)}
                    >
                      <div className="text-sm p-1">
                        <div className="font-semibold text-slate-900">{e.name}</div>
                        <div className={isStale ? "text-xs text-amber-600" : "text-xs text-slate-500"}>
                          {isStale ? "Last seen" : "Updated"} {new Date(e.updatedAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </InfoWindowF>
                  )}
                </MarkerF>
              );
            })}
          </GoogleMap>
        ) : (
          <div style={containerStyle} className="flex items-center justify-center text-slate-400">
            Loading map…
          </div>
        )}
      </Card>
    </div>
  );
}


