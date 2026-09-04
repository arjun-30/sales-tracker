import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../lib/api";
import { getCurrentPosition } from "../lib/locationTask";
import type { Visit } from "../lib/types";

export default function VisitsScreen() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shopName, setShopName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  async function handleCheckIn() {
    if (!shopName.trim()) {
      Alert.alert("Missing info", "Shop name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const pos = await getCurrentPosition();
      if (!pos) {
        Alert.alert("Location unavailable", "Enable location to check in.");
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
        Alert.alert("Location unavailable", "Enable location to check out.");
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={visits}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
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
        <View style={styles.formCard}>
          {openVisit ? (
            <>
              <Text style={styles.formTitle}>Currently at {openVisit.shopName}</Text>
              <Text style={styles.formHint}>
                Checked in {new Date(openVisit.checkInAt).toLocaleTimeString()}
              </Text>
              <TouchableOpacity
                style={[styles.button, styles.checkoutButton]}
                onPress={handleCheckOut}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Check out</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.formTitle}>Check in to a shop</Text>
              <TextInput
                style={styles.input}
                placeholder="Shop name *"
                value={shopName}
                onChangeText={setShopName}
              />
              <TextInput
                style={styles.input}
                placeholder="Notes"
                value={notes}
                onChangeText={setNotes}
              />
              <TouchableOpacity style={styles.button} onPress={handleCheckIn} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Check in</Text>
                )}
              </TouchableOpacity>
            </>
          )}
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Recent visits</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No visits yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.shop}>{item.shopName}</Text>
          <Text style={styles.time}>
            {new Date(item.checkInAt).toLocaleString()}
            {item.checkOutAt ? ` → ${new Date(item.checkOutAt).toLocaleTimeString()}` : " (open)"}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 20 },
  formCard: { gap: 10, marginBottom: 8 },
  formTitle: { fontSize: 16, fontWeight: "700" },
  formHint: { fontSize: 13, color: "#6b7280" },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: "#6b7280" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: { backgroundColor: "#1d4ed8", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  checkoutButton: { backgroundColor: "#dc2626" },
  buttonText: { color: "#fff", fontWeight: "700" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, gap: 4 },
  shop: { fontSize: 15, fontWeight: "600" },
  time: { fontSize: 12, color: "#6b7280" },
});
