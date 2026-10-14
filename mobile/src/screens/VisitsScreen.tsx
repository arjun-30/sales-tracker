import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../lib/api";
import { getCurrentPosition } from "../lib/locationTask";
import { useDuty } from "../context/DutyContext";
import type { Visit } from "../lib/types";
import { Button, Card, EmptyState, Field, Loading, SectionLabel } from "../components/ui";
import { colors, formatDuration, formatTime } from "../theme";

const RECENT_SHOPS = 3;

function minutesBetween(from: string, to: string | null) {
  return Math.max(0, ((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60000);
}

function hoursAndMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function VisitsScreen() {
  const { onDuty, busy: dutyBusy, toggleDuty } = useDuty();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shopName, setShopName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await api<{ visits: Visit[] }>("/api/visits");
      setVisits(data.visits);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openVisit = visits.find((v) => !v.checkOutAt);

  // Re-render every 30 s so the time-at-shop counter stays current.
  useEffect(() => {
    if (!openVisit) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [openVisit]);

  const history = useMemo(() => visits.filter((v) => v.checkOutAt), [visits]);

  // Shops this salesperson keeps going back to, for one-tap check-in.
  const recentShops = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const v of history) {
      const key = v.shopName.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        names.push(v.shopName.trim());
      }
      if (names.length === RECENT_SHOPS) break;
    }
    return names;
  }, [history]);

  const days = useMemo(() => {
    const groups: { label: string; visits: Visit[]; minutes: number }[] = [];
    for (const v of history) {
      const label = dayLabel(v.checkInAt);
      let group = groups[groups.length - 1];
      if (!group || group.label !== label) {
        group = { label, visits: [], minutes: 0 };
        groups.push(group);
      }
      group.visits.push(v);
      group.minutes += minutesBetween(v.checkInAt, v.checkOutAt);
    }
    return groups;
  }, [history]);

  async function handleCheckIn() {
    if (!shopName.trim()) {
      Alert.alert("Shop name needed", "Enter the name of the shop you're visiting.");
      return;
    }
    setSubmitting(true);
    try {
      const pos = await getCurrentPosition();
      if (!pos) {
        Alert.alert("Location unavailable", "Turn on location to check in.");
        return;
      }
      await api("/api/visits/checkin", {
        method: "POST",
        body: JSON.stringify({ shopName: shopName.trim(), notes: notes.trim() || undefined, ...pos }),
      });
      setShopName("");
      setNotes("");
      await load();
    } catch (err) {
      Alert.alert("Couldn't check in", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckOut() {
    if (!openVisit) return;
    setSubmitting(true);
    try {
      const pos = await getCurrentPosition();
      if (!pos) {
        Alert.alert("Location unavailable", "Turn on location to check out.");
        return;
      }
      await api(`/api/visits/${openVisit.id}/checkout`, { method: "POST", body: JSON.stringify(pos) });
      await load();
    } catch (err) {
      Alert.alert("Couldn't check out", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
    >
      {openVisit ? (
        <Card style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text style={styles.statusText}>At shop now</Text>
            <Text style={styles.timer}>{hoursAndMinutes(minutesBetween(openVisit.checkInAt, null))}</Text>
          </View>
          <Text style={styles.activeShop}>{openVisit.shopName}</Text>
          <Text style={styles.meta}>Checked in at {formatTime(openVisit.checkInAt)}</Text>
          {openVisit.notes ? <Text style={styles.notes}>{openVisit.notes}</Text> : null}
          <Button label="Check out" icon="log-out-outline" onPress={handleCheckOut} loading={submitting} />
        </Card>
      ) : !onDuty ? (
        <Card style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: colors.textFaint }]} />
            <Text style={styles.statusText}>Off duty</Text>
          </View>
          <Text style={styles.cardTitle}>Start duty to check in</Text>
          <Text style={styles.meta}>Shop visits are recorded against your working day.</Text>
          <Button label="Start duty" onPress={toggleDuty} loading={dutyBusy} />
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Check in to a shop</Text>
          <Text style={styles.meta}>Your current location is saved with the visit.</Text>
          <Field
            label="Shop name"
            icon="storefront-outline"
            placeholder="e.g. Sri Murugan Paints"
            value={shopName}
            onChangeText={setShopName}
          />
          {recentShops.length > 0 && !shopName ? (
            <View style={styles.recent}>
              <Text style={styles.recentLabel}>Recent shops</Text>
              {recentShops.map((name, i) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.recentShop, i > 0 && styles.recentShopBorder]}
                  onPress={() => setShopName(name)}
                >
                  <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.recentShopText} numberOfLines={1}>
                    {name}
                  </Text>
                  <Ionicons name="arrow-up-outline" size={15} color={colors.textFaint} style={{ transform: [{ rotate: "-45deg" }] }} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <Field
            label="Notes (optional)"
            icon="create-outline"
            placeholder="e.g. asked for shade card"
            value={notes}
            onChangeText={setNotes}
          />
          <Button label="Check in" icon="location-outline" onPress={handleCheckIn} loading={submitting} />
        </Card>
      )}

      {days.length === 0 && !openVisit ? (
        <EmptyState icon="storefront-outline" title="No visits yet" hint="Your shop visits will appear here." />
      ) : null}

      {days.map((day) => (
        <View key={day.label} style={styles.day}>
          <View style={styles.dayHeader}>
            <SectionLabel>{day.label}</SectionLabel>
            <Text style={styles.daySummary}>
              {day.visits.length} {day.visits.length === 1 ? "visit" : "visits"} · {hoursAndMinutes(day.minutes)}
            </Text>
          </View>
          <Card style={styles.group}>
            {day.visits.map((v, i) => (
              <View key={v.id}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shop} numberOfLines={1}>
                      {v.shopName}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatTime(v.checkInAt)} – {formatTime(v.checkOutAt!)}
                      {v.notes ? `  ·  ${v.notes}` : ""}
                    </Text>
                  </View>
                  <Text style={styles.duration}>{formatDuration(v.checkInAt, v.checkOutAt)}</Text>
                </View>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 18, paddingBottom: 32 },
  card: { gap: 12, padding: 18 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.textMuted },
  timer: { fontSize: 15, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  activeShop: { fontSize: 22, fontWeight: "700", color: colors.text },
  meta: { fontSize: 14, color: colors.textMuted, marginTop: -6 },
  notes: { fontSize: 14, color: colors.text },
  recent: { marginTop: -4 },
  recentLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginBottom: 2 },
  recentShop: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  recentShopBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  recentShopText: { flex: 1, fontSize: 15, color: colors.text },
  day: { gap: 8 },
  dayHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  daySummary: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  group: { padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 16 },
  shop: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  duration: { fontSize: 14, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
});
