// Shared look for every screen: change a value here, not in a screen's StyleSheet.
export const colors = {
  primary: "#1d4ed8",
  primaryDark: "#1e3a8a",
  primarySoft: "#eff6ff",
  success: "#15803d",
  successSoft: "#ecfdf5",
  warning: "#b45309",
  warningSoft: "#fffbeb",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  text: "#0f172a",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  surface: "#ffffff",
  background: "#f1f5f9",
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const statusTone = {
  pending: { fg: colors.warning, bg: colors.warningSoft, label: "Pending" },
  confirmed: { fg: colors.primary, bg: colors.primarySoft, label: "Confirmed" },
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
