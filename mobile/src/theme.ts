// Shared look for every screen: change a value here, not in a screen's StyleSheet.
export const colors = {
  // Cobalt accent on warm beige, matching the admin panel.
  primary: "#0047ab",
  primaryDark: "#003a8e",
  primarySoft: "#eef3fc",
  ink: "#2f271f",
  inkSoft: "#5e5243",
  success: "#15803d",
  successSoft: "#ecfdf5",
  warning: "#b45309",
  warningSoft: "#fffbeb",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  text: "#171717",
  textMuted: "#737373",
  textFaint: "#a3a3a3",
  border: "#e8dfd0",
  borderStrong: "#d8cab3",
  surface: "#ffffff",
  background: "#f3ede3",
};



export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

// Order status as an icon and a word: a clock while waiting, one tick once the
// office confirms, two ticks when delivered, a cross if cancelled.
export const statusTone = {
  pending: { fg: colors.warning, icon: "time-outline", label: "Pending" },
  confirmed: { fg: "#0369a1", icon: "checkmark-outline", label: "Confirmed" },
  delivered: { fg: colors.success, icon: "checkmark-done-outline", label: "Delivered" },
  cancelled: { fg: colors.danger, icon: "close-circle-outline", label: "Cancelled" },
} as const;

export function formatINR(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const day = sameDay ? "Today" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${day}, ${formatTime(iso)}`;
}

export function formatDuration(fromIso: string, toIso?: string | null) {
  const ms = (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

// "ROALUX WATERBASE PRIMER(EXTERIOR)" → "Roalux Waterbase Primer (Exterior)".
// Catalogue names are stored in capitals; this is display only.
export function displayProductName(name: string) {
  return name
    .toLowerCase()
    .replace(/\(/g, " (")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

// An order line's product and size, for a catalogue size or a custom one.
export function itemName(i: {
  variant: { product: { name: string } } | null;
  product: { name: string } | null;
  customName: string | null;
}) {
  return displayProductName(i.variant?.product.name ?? i.product?.name ?? i.customName ?? "Custom item");
}

export function itemSize(i: { variant: { sizeLabel: string } | null; customSize: string | null }) {
  if (i.variant) return i.variant.sizeLabel === "STD" ? "Standard pack" : i.variant.sizeLabel;
  return `${i.customSize ?? ""} (custom)`;
}

// 75000 → "1:15"
export function formatClock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
