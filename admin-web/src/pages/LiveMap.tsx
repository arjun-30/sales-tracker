import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import type { District, EmployeeLocation } from "../lib/types";
import { Select } from "../components/ui/Input";
import { Card } from "../components/ui/Card";

const CHENNAI = { lat: 13.0827, lng: 80.2707 };
const containerStyle = { width: "100%", height: "calc(100vh - 3rem)" };

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
  const [selected, setSelected] = useState<string | null>(null);

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

  const onSelect = useCallback((id: string) => setSelected((cur) => (cur === id ? null : id)), []);

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

      <Card className="overflow-hidden">
        {isLoaded ? (
          <GoogleMap mapContainerStyle={containerStyle} center={CHENNAI} zoom={7}>
            {visibleEntries.map((e) => (
              <MarkerF
                key={e.employeeId}
                position={{ lat: e.lat, lng: e.lng }}
                onClick={() => onSelect(e.employeeId)}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: "#2563eb",
                  fillOpacity: 1,
                  strokeColor: "#ffffff",
                  strokeWeight: 2,
                }}
              >
                {selected === e.employeeId && (
                  <InfoWindowF position={{ lat: e.lat, lng: e.lng }} onCloseClick={() => setSelected(null)}>
                    <div className="text-sm">
                      <div className="font-semibold">{e.name}</div>
                      <div className="text-slate-500">
                        Updated {new Date(e.updatedAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </InfoWindowF>
                )}
              </MarkerF>
            ))}
          </GoogleMap>
        ) : (
          <div style={containerStyle} className="flex items-center justify-center text-slate-400">
            Loading map…
          </div>
        )}
      </Card>

      <div className="text-sm text-slate-500">
        {visibleEntries.length} employee{visibleEntries.length === 1 ? "" : "s"} on duty
      </div>
    </div>
  );
}
