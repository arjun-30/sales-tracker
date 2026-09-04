import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { api } from "../lib/api";
import {
  getCurrentPosition,
  isBackgroundLocationRunning,
  requestLocationPermissions,
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
} from "../lib/locationTask";

interface DutyContextValue {
  onDuty: boolean;
  busy: boolean;
  toggleDuty: () => Promise<void>;
}

const DutyContext = createContext<DutyContextValue | undefined>(undefined);

export function DutyProvider({ children }: { children: React.ReactNode }) {
  const [onDuty, setOnDuty] = useState(false);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    isBackgroundLocationRunning().then((running) => {
      setOnDuty(running);
      setBusy(false);
    });
  }, []);

  const toggleDuty = useCallback(async () => {
    setBusy(true);
    try {
      if (!onDuty) {
        const perms = await requestLocationPermissions();
        if (!perms.granted) {
          Alert.alert(
            "Location permission needed",
            "PaintTracker needs location access to go on duty."
          );
          return;
        }
        if (!perms.backgroundGranted) {
          Alert.alert(
            "Background location recommended",
            "Without \"Allow all the time\", your position stops updating for the admin when the app is in the background."
          );
        }

        const pos = await getCurrentPosition();
        await api("/api/tracking/duty", {
          method: "POST",
          body: JSON.stringify({ onDuty: true, lat: pos?.lat, lng: pos?.lng }),
        });
        await startBackgroundLocationUpdates();
        setOnDuty(true);
      } else {
        await stopBackgroundLocationUpdates();
        await api("/api/tracking/duty", { method: "POST", body: JSON.stringify({ onDuty: false }) });
        setOnDuty(false);
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, [onDuty]);

  const value = useMemo(() => ({ onDuty, busy, toggleDuty }), [onDuty, busy, toggleDuty]);

  return <DutyContext.Provider value={value}>{children}</DutyContext.Provider>;
}

export function useDuty(): DutyContextValue {
  const ctx = useContext(DutyContext);
  if (!ctx) throw new Error("useDuty must be used within DutyProvider");
  return ctx;
}
