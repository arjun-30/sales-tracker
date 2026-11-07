import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../lib/api";
import { getCurrentPosition } from "../lib/locationTask";
import { distanceKm, formatKm, type LatLng } from "../lib/geo";
import { useDuty } from "../context/DutyContext";
import type { Store, Visit } from "../lib/types";
import type { RootStackParamList } from "../navigation/types";
import { Button, Card, EmptyState, Field, Loading, SectionLabel } from "../components/ui";
import { CheckoutForm, type CheckoutDetails } from "../components/CheckoutForm";
import { colors, formatDuration, formatINR, formatTime } from "../theme";

// Shops listed to pick from: the nearest, or the best matches for a search.
const SHOPS_SHOWN = 5;

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { onDuty, busy: dutyBusy, toggleDuty } = useDuty();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Visits are to shops on the plant's map, so the owner can be told how it went.
  const [stores, setStores] = useState<Store[]>([]);
  const [me, setMe] = useState<LatLng | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Store | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
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

  const loadStores = useCallback(async () => {
    getCurrentPosition().then((pos) => {
      if (pos) setMe(pos);
    });
    try {
      const data = await api<{ stores: Store[] }>("/api/stores");
      setStores(data.stores);
    } catch {
      // The list stays as it was; check-in still works once it loads.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadStores();
    }, [load, loadStores])
  );

  const openVisit = visits.find((v) => !v.checkOutAt);

  // Re-render every 30 s so the time-at-shop counter stays current.
  useEffect(() => {
    if (!openVisit) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [openVisit]);

  const history = useMemo(() => visits.filter((v) => v.checkOutAt), [visits]);

  // The nearest shops, or those matching the search, nearest first.
  const shopChoices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .map((s) => ({ store: s, km: me ? distanceKm(me, s) : null }))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || a.store.name.localeCompare(b.store.name))
      .slice(0, SHOPS_SHOWN);
  }, [stores, me, query]);

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
    if (!picked) {
      Alert.alert("Pick the shop", "Choose the shop you're visiting from the list.");
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
        body: JSON.stringify({ storeId: picked.id, notes: notes.trim() || undefined, ...pos }),
      });
      setPicked(null);
      setQuery("");
      setNotes("");
      await load();
    } catch (err) {
      Alert.alert("Couldn't check in", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckOut(details: CheckoutDetails) {
    if (!openVisit) return;
    setSubmitting(true);
    try {
      const pos = await getCurrentPosition();
      if (!pos) {
        Alert.alert("Location unavailable", "Turn on location to check out.");
        return;
      }
      await api(`/api/visits/${openVisit.id}/checkout`, { method: "POST", body: JSON.stringify({ ...pos, ...details }) });
      setCheckingOut(false);
      await load();
      loadStores();
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
          {checkingOut ? (
            <CheckoutForm
              shopName={openVisit.shopName}
              hasOwnerPhone={!!stores.find((s) => s.id === openVisit.storeId)?.phone}
              submitting={submitting}
              onSubmit={handleCheckOut}
              onCancel={() => setCheckingOut(false)}
            />
          ) : (
            <View style={{ gap: 8 }}>
              <Button label="Take order here" icon="cart-outline" onPress={() => navigation.navigate("NewOrder")} variant="secondary" />
              <Button label="Check out" icon="log-out-outline" onPress={() => setCheckingOut(true)} />
            </View>
          )}
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
          <Text style={styles.meta}>Your location is saved with the visit. The shop owner gets an SMS about the visit.</Text>
          {picked ? (
            <View style={styles.picked}>
              <Ionicons name="storefront" size={18} color={colors.text} />
              <Text style={styles.pickedName} numberOfLines={1}>
                {picked.name}
              </Text>
              <TouchableOpacity onPress={() => setPicked(null)} hitSlop={10} accessibilityLabel="Pick another shop">
                <Text style={styles.link}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Field
                label="Shop"
                icon="search-outline"
                placeholder="Search the shops on your map"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
              <View style={styles.recent}>
                <Text style={styles.recentLabel}>{query.trim() ? "Matching shops" : me ? "Nearest shops" : "Shops"}</Text>
                {shopChoices.map(({ store, km }, i) => (
                  <TouchableOpacity
                    key={store.id}
                    style={[styles.recentShop, i > 0 && styles.recentShopBorder]}
                    onPress={() => setPicked(store)}
                  >
                    <Ionicons name="storefront-outline" size={16} color={colors.textMuted} />
                    <Text style={styles.recentShopText} numberOfLines={1}>
                      {store.name}
                    </Text>
                    {km !== null ? <Text style={styles.km}>{formatKm(km)}</Text> : null}
                  </TouchableOpacity>
                ))}
                {shopChoices.length === 0 ? <Text style={styles.empty}>No shop by that name on your map.</Text> : null}
                <TouchableOpacity style={[styles.recentShop, styles.recentShopBorder]} onPress={() => navigation.navigate("AddStore")}>
                  <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                  <Text style={[styles.recentShopText, { color: colors.primary }]}>Not on the map? Add the shop</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          <Field
            label="Notes (optional)"
            icon="create-outline"
            placeholder="e.g. asked for shade card"
            value={notes}
            onChangeText={setNotes}
          />
          <Button label="Check in" icon="location-outline" onPress={handleCheckIn} loading={submitting} disabled={!picked} />
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
                    {v.paymentAmount || v.paymentMode === "credit" ? (
                      <Text style={styles.paid}>
                        {v.paymentMode === "credit" ? "On credit" : `${formatINR(v.paymentAmount!)} received`}
                      </Text>
                    ) : null}
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
  km: { fontSize: 13, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  empty: { fontSize: 14, color: colors.textMuted, paddingVertical: 10 },
  picked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  pickedName: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text },
  link: { fontSize: 14, fontWeight: "600", color: colors.primary },
  day: { gap: 8 },
  dayHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  daySummary: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  group: { padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 16 },
  shop: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  paid: { fontSize: 13, fontWeight: "600", color: colors.success, marginTop: 2 },
  duration: { fontSize: 14, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
});
