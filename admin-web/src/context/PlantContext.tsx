import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setScopePlantId } from "../lib/api";
import type { Plant } from "../lib/types";
import { useAuth } from "./AuthContext";

interface PlantContextValue {
  isSuperAdmin: boolean;
  // Every plant for the super admin; just their own for a plant admin.
  plants: Plant[];
  // The plant being looked at: the super admin's pick ("" = all plants), or a
  // plant admin's own plant.
  plantId: string;
  plant: Plant | null;
  selectPlant: (plantId: string) => void;
  reloadPlants: () => Promise<void>;
}

const PlantContext = createContext<PlantContextValue | undefined>(undefined);

const STORAGE_KEY = "pt_plant";

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function PlantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [plants, setPlants] = useState<Plant[]>([]);
  const [selected, setSelected] = useState(() => {
    const initial = readStored();
    setScopePlantId(initial);
    return initial;
  });

  const selectPlant = useCallback((plantId: string) => {
    setScopePlantId(plantId);
    setSelected(plantId);
    try {
      localStorage.setItem(STORAGE_KEY, plantId);
    } catch {
      // only a convenience
    }
  }, []);

  const reloadPlants = useCallback(async () => {
    const d = await api<{ plants: Plant[] }>("/api/plants");
    setPlants(d.plants);
  }, []);

  useEffect(() => {
    if (!user) return;
    // A plant admin's scope comes from the server; nothing to send.
    if (!isSuperAdmin) selectPlant("");
    reloadPlants().catch(() => setPlants([]));
  }, [user, isSuperAdmin, reloadPlants, selectPlant]);

  // A remembered plant that has since been deleted falls back to all plants.
  useEffect(() => {
    if (isSuperAdmin && selected && plants.length > 0 && !plants.some((p) => p.id === selected)) selectPlant("");
  }, [isSuperAdmin, selected, plants, selectPlant]);

  const plantId = isSuperAdmin ? selected : (user?.plantId ?? "");
  const plant = plants.find((p) => p.id === plantId) ?? null;

  return (
    <PlantContext.Provider value={{ isSuperAdmin, plants, plantId, plant, selectPlant, reloadPlants }}>
      {children}
    </PlantContext.Provider>
  );
}

export function usePlant(): PlantContextValue {
  const ctx = useContext(PlantContext);
  if (!ctx) throw new Error("usePlant must be used within PlantProvider");
  return ctx;
}
