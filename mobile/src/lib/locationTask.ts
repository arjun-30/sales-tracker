import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { api, SessionExpiredError } from "./api";

export const LOCATION_TASK_NAME = "paint-tracker-background-location";

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn("[locationTask] error", error);
    return;
  }
  const { locations } = (data as { locations: Location.LocationObject[] }) ?? { locations: [] };
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  try {
    await api("/api/tracking/location", {
      method: "PATCH",
      body: JSON.stringify({
        lat: latest.coords.latitude,
        lng: latest.coords.longitude,
        accuracy: latest.coords.accuracy ?? undefined,
      }),
    });
  } catch (err) {
    // Offline or session expired mid-shift: the next successful tick will
    // catch the device up, so we swallow rather than crash the background task.
    if (!(err instanceof SessionExpiredError)) {
      console.warn("[locationTask] failed to report location", err);
    }
  }
});

export async function requestLocationPermissions(): Promise<{
  granted: boolean;
  backgroundGranted: boolean;
}> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    return { granted: false, backgroundGranted: false };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { granted: true, backgroundGranted: bg.status === "granted" };
}

export async function isBackgroundLocationRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
}

export async function startBackgroundLocationUpdates(): Promise<void> {
  const already = await isBackgroundLocationRunning();
  if (already) return;

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 25000,
    distanceInterval: 30,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "PaintTracker — on duty",
      notificationBody: "Sharing your live location with the admin team.",
    },
  });
}

export async function stopBackgroundLocationUpdates(): Promise<void> {
  const started = await isBackgroundLocationRunning();
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}

export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
