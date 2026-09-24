import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../lib/api";
import { getCurrentPosition } from "../lib/locationTask";
import type { Visit } from "../lib/types";
import { Button, Card, EmptyState, Field, Loading, SectionLabel } from "../components/ui";
import { colors, formatDateTime, formatDuration, formatTime, radius } from "../theme";

export default function VisitsScreen() {
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

  // Re-render every 30 s so the "time at shop" counter stays current.
  useEffect(() => {
    if (!openVisit) return;
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [openVisit]);

  async function handleCheckIn() {
    if (!shopName.trim()) {
      Alert.alert("Missing info", "Shop name is required.");
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
      Alert.alert("Error", err instanceof Error ? err.message : "Check-in failed");
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
      Alert.alert("Error", err instanceof Error ? err.message : "Check-out failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Loading />;

  const history = visits.filter((v) => v.checkOutAt);

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={history}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
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
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 4 }}>
          {openVisit ? (
            <Card style={styles.active}>
              <View style={styles.activeHeader}>
                <View style={styles.liveDot} />
                <Text style={styles.activeLabel}>At a shop now</Text>
              </View>
              <Text style={styles.activeShop}>{openVisit.shopName}</Text>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                <Text style={styles.meta}>
                  In since {formatTime(openVisit.checkInAt)} · {formatDuration(openVisit.checkInAt)}
                </Text>
              </View>
              {openVisit.notes ? <Text style={styles.notes}>{openVisit.notes}</Text> : null}
              <Button label="Check out" icon="exit-outline" variant="danger" onPress={handleCheckOut} loading={submitting} />
            </Card>
          ) : (
            <Card style={{ gap: 14 }}>
              <Text style={styles.formTitle}>Check in to a shop</Text>
              <Field icon="storefront-outline" placeholder="Shop name *" value={shopName} onChangeText={setShopName} />
              <Field icon="create-outline" placeholder="Notes (optional)" value={notes} onChangeText={setNotes} />
              <Button label="Check in here" icon="location" onPress={handleCheckIn} loading={submitting} />
              <Text style={styles.hint}>Your current GPS location is saved with the visit.</Text>
            </Card>
          )}
          {history.length > 0 ? <SectionLabel>Recent visits</SectionLabel> : null}
        </View>
      }
      ListEmptyComponent={
        openVisit ? null : (
          <EmptyState icon="storefront-outline" title="No visits yet" hint="Check in when you reach a shop." />
        )
      }
      renderItem={({ item }) => (
        <Card style={styles.visit}>
          <View style={styles.visitIcon}>
            <Ionicons name="storefront" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.shop} numberOfLines={1}>
              {item.shopName}
            </Text>
            <Text style={styles.meta}>
              {formatDateTime(item.checkInAt)} · {formatDuration(item.checkInAt, item.checkOutAt)}
            </Text>
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  formTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  hint: { fontSize: 12, color: colors.textFaint, textAlign: "center" },
  active: { gap: 10, borderColor: colors.success, borderWidth: 2, backgroundColor: colors.successSoft },
  activeHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  activeLabel: { fontSize: 12, fontWeight: "800", color: colors.success, textTransform: "uppercase", letterSpacing: 0.6 },
  activeShop: { fontSize: 22, fontWeight: "800", color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontSize: 13, color: colors.textMuted },
  notes: { fontSize: 14, color: colors.text, fontStyle: "italic" },
  visit: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  visitIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  shop: { fontSize: 15, fontWeight: "700", color: colors.text },
});
