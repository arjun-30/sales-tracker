import React, { useState } from "react";
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Button, Field } from "./ui";
import type { PaymentMode } from "../lib/types";
import { colors, formatINR, radius } from "../theme";

export interface CheckoutDetails {
  paymentAmount?: number;
  paymentMode?: PaymentMode;
  paymentRef?: string;
  nextVisitOn?: string;
  notifyOwner: boolean;
}

const MODES: { value: PaymentMode | "none"; label: string }[] = [
  { value: "none", label: "No payment" },
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "bank_transfer", label: "Bank" },
  { value: "credit", label: "Credit" },
];

// Quick picks for the next visit; days from today.
const NEXT_IN_DAYS = [3, 7, 15, 30];

// YYYY-MM-DD of today + days, on the phone's (Indian) calendar.
function dayFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dayLabel = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

// What happened at the shop, asked before checking out: payment taken, when to
// come back, and whether the owner gets the SMS.
export function CheckoutForm({
  shopName,
  hasOwnerPhone,
  submitting,
  onSubmit,
  onCancel,
}: {
  shopName: string;
  hasOwnerPhone: boolean;
  submitting: boolean;
  onSubmit: (d: CheckoutDetails) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<PaymentMode | "none">("none");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [nextIn, setNextIn] = useState<number | null>(7);
  const [notifyOwner, setNotifyOwner] = useState(true);
  const paid = mode !== "none" && mode !== "credit";

  function submit() {
    const value = Number(amount);
    if (paid && !(value > 0)) {
      Alert.alert("Amount needed", "Enter the amount the shop paid.");
      return;
    }
    if (mode === "cheque" && !ref.trim()) {
      Alert.alert("Cheque number needed", "Enter the cheque number.");
      return;
    }
    onSubmit({
      ...(paid ? { paymentAmount: Math.round(value * 100) / 100, paymentMode: mode, paymentRef: ref.trim() || undefined } : {}),
      ...(mode === "credit" ? { paymentMode: "credit" as const } : {}),
      nextVisitOn: nextIn ? dayFromNow(nextIn) : undefined,
      notifyOwner,
    });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Before you leave {shopName}</Text>

      <Text style={styles.label}>Payment</Text>
      <View style={styles.chips}>
        {MODES.map((m) => (
          <Chip key={m.value} label={m.label} on={mode === m.value} onPress={() => setMode(m.value)} />
        ))}
      </View>
      {paid ? (
        <>
          <Field
            label="Amount received (₹)"
            placeholder="0"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
          />
          {mode !== "cash" ? (
            <Field
              label={mode === "cheque" ? "Cheque number" : "Reference / UTR (optional)"}
              placeholder={mode === "cheque" ? "004512" : "Last digits of the transaction"}
              value={ref}
              onChangeText={setRef}
              autoCapitalize="characters"
            />
          ) : null}
        </>
      ) : null}

      <Text style={styles.label}>Next visit</Text>
      <View style={styles.chips}>
        {NEXT_IN_DAYS.map((d) => (
          <Chip key={d} label={d === 7 ? "1 week" : d === 30 ? "1 month" : `${d} days`} on={nextIn === d} onPress={() => setNextIn(d)} />
        ))}
        <Chip label="Not set" on={nextIn === null} onPress={() => setNextIn(null)} />
      </View>
      {nextIn ? <Text style={styles.hint}>{dayLabel(dayFromNow(nextIn))}</Text> : null}

      {hasOwnerPhone ? (
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>SMS the owner</Text>
            <Text style={styles.hint}>
              {paid ? "Visit message and a receipt for the payment" : "A message that you visited"}
            </Text>
          </View>
          <Switch
            value={notifyOwner}
            onValueChange={setNotifyOwner}
            trackColor={{ true: colors.text, false: colors.borderStrong }}
            thumbColor="#fff"
          />
        </View>
      ) : null}

      <Button
        label={paid && Number(amount) > 0 ? `Check out · ${formatINR(Number(amount))} received` : "Check out"}
        icon="log-out-outline"
        onPress={submit}
        loading={submitting}
      />
      <TouchableOpacity onPress={onCancel} style={styles.cancel} hitSlop={8}>
        <Text style={styles.cancelText}>Stay checked in</Text>
      </TouchableOpacity>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontSize: 14, fontWeight: "600", color: colors.text },
  chipTextOn: { color: "#fff" },
  hint: { fontSize: 12, color: colors.textMuted },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  switchTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  cancel: { alignSelf: "center", paddingVertical: 4 },
  cancelText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
});
