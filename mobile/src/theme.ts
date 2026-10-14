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

// Supporting colours for icons and soft tinted tiles on top of beige and cobalt.
// Use the soft tint as a background with the strong colour for icon and text.
export const accents = {
  cobalt: { strong: "#0047ab", soft: "#e6edf9" },
  green: { strong: "#1f7a4d", soft: "#e4f2ea" },
  terracotta: { strong: "#b4532a", soft: "#f8e8df" },
  amber: { strong: "#9a6700", soft: "#fbf0d7" },
};


export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const statusTone = {
  pending: { fg: colors.warning, bg: colors.warningSoft, label: "Pending" },
  confirmed: { fg: "#0369a1", bg: "#f0f9ff", label: "Confirmed" },
  delivered: { fg: colors.success, bg: colors.successSoft, label: "Delivered" },
  cancelled: { fg: colors.danger, bg: colors.dangerSoft, label: "Cancelled" },
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
