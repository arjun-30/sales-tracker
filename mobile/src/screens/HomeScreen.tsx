import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useNavigation, type CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { useDuty } from "../context/DutyContext";
import { api } from "../lib/api";
import { getCurrentPosition } from "../lib/locationTask";
import type { Order, Store, Visit } from "../lib/types";
import type { RootStackParamList, TabParamList } from "../navigation/types";
import { Button, Card, SectionLabel } from "../components/ui";
import { StoreMap } from "../components/StoreMap";
import { colors, formatINR, radius } from "../theme";

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, "Home">,
  NativeStackNavigationProp<RootStackParamList>
>;

interface TodayStats {
  orders: number;
  sales: number;
  visits: number;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { onDuty, busy, toggleDuty } = useDuty();
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The plant's shops for the map, and where the salesperson is now.
  const loadStores = useCallback(async () => {
    try {
      const [s, pos] = await Promise.all([api<{ stores: Store[] }>("/api/stores"), getCurrentPosition()]);
      setStores(s.stores);
      if (pos) setMe(pos);
    } catch {
      setStores((prev) => prev ?? []);
    }
  }, []);

  const loadStats = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const from = encodeURIComponent(start.toISOString());
    try {
      const [o, v] = await Promise.all([
        api<{ orders: Order[] }>(`/api/orders?from=${from}`),
        api<{ visits: Visit[] }>(`/api/visits?from=${from}`),
      ]);
      const live = o.orders.filter((x) => x.status !== "cancelled");
      setStats({
        orders: live.length,
        sales: live.reduce((sum, x) => sum + x.totalAmount, 0),
        visits: v.visits.length,
      });
    } catch {
      // Stats are a convenience; the rest of the screen works without them.
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadStores();
    }, [loadStats, loadStores])
  );

  function newOrder() {
    if (!onDuty) {
      Alert.alert("You're off duty", "Start duty to take orders.");
      return;
    }
    navigation.navigate("NewOrder");
  }

  const initials = (user?.name ?? "?")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadStats();
              loadStores();
            }}
          />
        }
      >
        <View style={styles.headerTop}>
          <Image source={require("../../assets/roalux-logo.png")} style={styles.logo} resizeMode="contain" />
          <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate("Profile")} accessibilityLabel="Profile">
            <Text style={styles.avatarText}>{initials}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Text style={styles.date}>{today}</Text>
          <Text style={styles.greeting}>
            {greeting()}, {user?.name?.split(" ")[0]}
          </Text>
          <Text style={styles.meta}>
            {[user?.employeeCode, user?.district?.name ?? "No district assigned"].filter(Boolean).join("   ·   ")}
          </Text>
          {onDuty ? (
            <View style={styles.dutyLine}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text style={styles.dutyLineText}>
                <Text style={styles.dutyLineStrong}>On duty</Text>  ·  hours being recorded
              </Text>
            </View>
          ) : null}
        </View>

        {onDuty ? null : (
          <Card style={styles.dutyOff}>
            <View style={styles.dutyRow}>
              <View style={[styles.dot, { backgroundColor: colors.textFaint }]} />
              <Text style={styles.dutyTitle}>Off duty</Text>
            </View>
            <Text style={styles.dutyHint}>Start duty to take orders, log shop visits and record your hours.</Text>
            <Button label="Start duty" loading={busy} onPress={toggleDuty} />
          </Card>
        )}

        <View style={styles.section}>
        <SectionLabel>Today</SectionLabel>
        <Card style={styles.stats}>
          <Stat label="Orders" value={stats ? String(stats.orders) : "–"} />
          <View style={styles.statDivider} />
          <Stat label="Sales" value={stats ? formatINR(stats.sales) : "–"} />
          <View style={styles.statDivider} />
          <Stat label="Visits" value={stats ? String(stats.visits) : "–"} />
        </Card>

        </View>

        <View style={styles.section}>
        <SectionLabel>Quick actions</SectionLabel>
        <Action icon="bag-add-outline" label="New order" primary={onDuty} onPress={newOrder} />
        <View style={styles.actions}>
          <Action icon="storefront-outline" label="Shop visit" onPress={() => navigation.navigate("Visits")} />
          <Action icon="pricetags-outline" label="Price list" onPress={() => navigation.navigate("Catalog")} />
        </View>
        </View>

        <View style={styles.section}>
          <SectionLabel>{stores && stores.length > 0 ? `Shops · ${stores.length}` : "Shops"}</SectionLabel>
          {stores ? <StoreMap stores={stores} me={me} /> : <Card style={styles.mapLoading}><ActivityIndicator color={colors.textMuted} /></Card>}
          <Action icon="add-circle-outline" label="Add the shop I'm in" onPress={() => navigation.navigate("AddStore")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

// White buttons by default; only the one main action on screen is filled.
function Action({
  icon,
  label,
  primary = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      style={[styles.action, primary && styles.actionPrimary]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={21} color={primary ? "#fff" : colors.text} />
      <Text style={[styles.actionLabel, primary && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 28 },
  section: { gap: 12 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  logo: { width: 92, height: 32 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "700", color: colors.text, letterSpacing: 0.5 },
  header: { marginTop: -4 },
  date: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.text, marginTop: 4 },
  meta: { fontSize: 14, color: colors.textMuted, marginTop: 6 },
  dutyLine: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  dutyLineText: { fontSize: 14, color: colors.textMuted },
  dutyLineStrong: { color: colors.success, fontWeight: "700" },
  dutyOff: { gap: 12, padding: 20 },
  dutyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dutyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  dutyHint: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: 2 },
  stats: { flexDirection: "row", padding: 0 },
  stat: { flex: 1, paddingVertical: 20, paddingHorizontal: 16, gap: 8 },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: 18 },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600", letterSpacing: 0.3 },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.text },
  actions: { flexDirection: "row", gap: 12 },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
  mapLoading: { height: 240, alignItems: "center", justifyContent: "center" },
});
