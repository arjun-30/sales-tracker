import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as Location from "expo-location";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { useNavigation } from "@react-navigation/native";
import { api } from "../lib/api";
import { distanceKm, formatKm } from "../lib/geo";
import type { Store } from "../lib/types";
import { Button, Card, Field } from "../components/ui";
import { colors } from "../theme";

// Shops this close to where the salesperson stands are probably the same one.
const NEARBY_KM = 0.1;
// A fix worse than this could put the pin on the wrong street.
const GOOD_ACCURACY_M = 50;

interface Fix {
  lat: number;
  lng: number;
  accuracy: number | null;
}

// Adding a shop from inside it: the phone's GPS places it, the salesperson
// types the details, and the office approves it before the team sees it.
export default function AddStoreScreen() {
  const navigation = useNavigation();
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(true);
  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) {
        Alert.alert("Location needed", "Allow location so the shop is pinned where you are standing.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null });
    } catch {
      Alert.alert("Couldn't find your position", "Step outside or near a window and try again.");
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    locate();
    api<{ stores: Store[] }>("/api/stores")
      .then((d) => setStores(d.stores))
      .catch(() => {});
  }, [locate]);

  const nearby = useMemo(
    () =>
      fix
        ? stores
            .map((s) => ({ store: s, km: distanceKm(fix, s) }))
            .filter((x) => x.km <= NEARBY_KM)
            .sort((a, b) => a.km - b.km)
        : [],
    [fix, stores]
  );

  async function save() {
    if (!fix) {
      Alert.alert("No position yet", "Wait for your location, then save.");
      return;
    }
    if (!name.trim()) {
      Alert.alert("Shop name needed", "Enter the name on the shop's board.");
      return;
    }
    if (phone && phone.length !== 10) {
      Alert.alert("Check the phone number", "Enter the 10-digit mobile number, or leave it empty.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/stores/from-field", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          ownerName: ownerName.trim() || null,
          phone: phone || null,
          address: address.trim() || null,
          notes: notes.trim() || null,
          lat: fix.lat,
          lng: fix.lng,
        }),
      });
      Alert.alert("Shop sent to the office", `${name.trim()} shows on your map now, and on everyone's once the office approves it.`);
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't add the shop", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const rough = fix?.accuracy != null && fix.accuracy > GOOD_ACCURACY_M;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={styles.mapCard}>
            {fix ? (
              <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                region={{ latitude: fix.lat, longitude: fix.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }}
                scrollEnabled={false}
                zoomEnabled={false}
                toolbarEnabled={false}
              >
                <Marker coordinate={{ latitude: fix.lat, longitude: fix.lng }} pinColor={colors.primary} />
              </MapView>
            ) : (
              <View style={[styles.map, styles.mapEmpty]}>
                {locating ? <ActivityIndicator color={colors.textMuted} /> : <Text style={styles.muted}>No position yet</Text>}
              </View>
            )}
            <View style={styles.fixRow}>
              <Ionicons name="locate-outline" size={18} color={rough ? colors.warning : colors.textMuted} />
              <Text style={[styles.fixText, rough && { color: colors.warning }]}>
                {locating
                  ? "Finding your position…"
                  : fix
                    ? `Pinned where you are${fix.accuracy != null ? `, accurate to about ${Math.round(fix.accuracy)} m` : ""}${rough ? ". Step outside for a better fix." : ""}`
                    : "Position not found"}
              </Text>
              <TouchableOpacity onPress={locate} disabled={locating} hitSlop={10} accessibilityLabel="Find my position again">
                <Text style={styles.link}>Retry</Text>
              </TouchableOpacity>
            </View>
          </Card>

          {nearby.length > 0 ? (
            <Card style={styles.warn}>
              <Text style={styles.warnTitle}>Already on the map nearby</Text>
              {nearby.map(({ store, km }) => (
                <Text key={store.id} style={styles.warnLine}>
                  {store.name} · {formatKm(km)}
                  {store.status === "pending" ? " · waiting for approval" : ""}
                </Text>
              ))}
              <Text style={styles.muted}>If it's one of these, there's no need to add it again.</Text>
            </Card>
          ) : null}

          <Card style={styles.form}>
            <Field label="Shop name" placeholder="As on the board, e.g. Sri Murugan Paints" value={name} onChangeText={setName} />
            <Field label="Owner (optional)" placeholder="Who runs the shop" value={ownerName} onChangeText={setOwnerName} />
            <Field
              label="Mobile number (optional)"
              placeholder="98765 43210"
              keyboardType="number-pad"
              maxLength={10}
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, ""))}
            />
            <Field label="Address (optional)" placeholder="Street, area, town" value={address} onChangeText={setAddress} />
            <Field label="Notes (optional)" placeholder="Landmark, best time to visit…" value={notes} onChangeText={setNotes} />
          </Card>
        </ScrollView>
        <View style={styles.footer}>
          <Button label="Send to office" icon="checkmark" onPress={save} loading={saving} disabled={!fix || !name.trim()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 14, paddingBottom: 32 },
  mapCard: { padding: 0, overflow: "hidden" },
  map: { height: 170 },
  mapEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: colors.border },
  fixRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14 },
  fixText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  link: { fontSize: 14, fontWeight: "600", color: colors.primary },
  muted: { fontSize: 13, color: colors.textMuted },
  warn: { gap: 6, padding: 16, borderColor: colors.warning, backgroundColor: colors.warningSoft },
  warnTitle: { fontSize: 14, fontWeight: "700", color: colors.warning },
  warnLine: { fontSize: 14, color: colors.text },
  form: { gap: 14, padding: 18 },
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
});
