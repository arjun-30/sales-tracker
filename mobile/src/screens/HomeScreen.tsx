import React, { useCallback, useState } from "react";
import {
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
import type { Order, Visit } from "../lib/types";
import type { RootStackParamList, TabParamList } from "../navigation/types";
import { Button, Card, SectionLabel } from "../components/ui";
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
  const { user, logout } = useAuth();
  const { onDuty, busy, toggleDuty } = useDuty();
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
    }, [loadStats])
  );

  function newOrder() {
    if (!onDuty) {
      Alert.alert("You're off duty", "Start duty to take orders.");
      return;
    }
    navigation.navigate("NewOrder");
  }

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
            }}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.logoPlate}>
              <Image source={require("../../assets/roalux-logo.png")} style={styles.logo} resizeMode="contain" />
            </View>
            <TouchableOpacity style={styles.logout} onPress={logout} accessibilityLabel="Log out">
              <Ionicons name="log-out-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.date}>{today}</Text>
          <Text style={styles.greeting}>
            {greeting()}, {user?.name?.split(" ")[0]}
          </Text>
          <Text style={styles.meta}>
            {[user?.employeeCode, user?.district?.name ?? "No district assigned"].filter(Boolean).join("   ·   ")}
          </Text>
        </View>

        <Card style={styles.duty}>
          <View style={styles.dutyRow}>
            <View style={[styles.dot, { backgroundColor: onDuty ? colors.success : colors.textFaint }]} />
            <Text style={styles.dutyTitle}>{onDuty ? "On duty" : "Off duty"}</Text>
          </View>
          <Text style={styles.dutyHint}>
            {onDuty
              ? "Your location is being shared with the office."
              : "Start duty to take orders, log shop visits and share your location."}
          </Text>
          <Button
            label={onDuty ? "Go off duty" : "Start duty"}
            variant={onDuty ? "secondary" : "primary"}
            loading={busy}
            onPress={toggleDuty}
          />
        </Card>

        <SectionLabel>Today</SectionLabel>
        <Card style={styles.stats}>
          <Stat label="Orders" value={stats ? String(stats.orders) : "–"} />
          <View style={styles.statDivider} />
          <Stat label="Sales" value={stats ? formatINR(stats.sales) : "–"} />
          <View style={styles.statDivider} />
          <Stat label="Visits" value={stats ? String(stats.visits) : "–"} />
        </Card>

        <SectionLabel>Quick actions</SectionLabel>
        <TouchableOpacity activeOpacity={0.85} style={styles.primaryAction} onPress={newOrder} accessibilityRole="button">
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.primaryActionText}>New order</Text>
        </TouchableOpacity>
        <View style={styles.actions}>
          <Action icon="storefront-outline" label="Shop visit" onPress={() => navigation.navigate("Visits")} />
          <Action icon="pricetags-outline" label="Price list" onPress={() => navigation.navigate("Catalog")} />
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

function Action({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.7} style={styles.action} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 16, gap: 14, paddingBottom: 32 },
  hero: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: 20, paddingTop: 16 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  logoPlate: { backgroundColor: "#fff", borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  logo: { width: 84, height: 28 },
  logout: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  date: { fontSize: 13, color: "rgba(255,255,255,0.72)", fontWeight: "500" },
  greeting: { fontSize: 24, fontWeight: "700", color: "#fff", marginTop: 4 },
  meta: { fontSize: 14, color: "rgba(255,255,255,0.72)", marginTop: 6, fontWeight: "500" },
  duty: { gap: 10, padding: 18 },
  dutyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dutyTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  dutyHint: { fontSize: 14, color: colors.textMuted, marginBottom: 4, lineHeight: 20 },
  stats: { flexDirection: "row", padding: 0 },
  stat: { flex: 1, paddingVertical: 16, paddingHorizontal: 14, gap: 6 },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: 14 },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600", letterSpacing: 0.3 },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.text },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  primaryActionText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12 },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
});
