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
  const { user } = useAuth();
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
        </View>

        {onDuty ? (
          <Card style={styles.dutyOn}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dutyTitle}>On duty</Text>
              <Text style={styles.dutyHint}>Your working hours are being recorded.</Text>
            </View>
          </Card>
        ) : (
          <Card style={styles.dutyOff}>
            <View style={styles.dutyRow}>
              <View style={[styles.dot, { backgroundColor: colors.textFaint }]} />
              <Text style={styles.dutyTitle}>Off duty</Text>
            </View>
            <Text style={styles.dutyHint}>Start duty to take orders, log shop visits and record your hours.</Text>
            <Button label="Start duty" loading={busy} onPress={toggleDuty} />
          </Card>
        )}

        <SectionLabel>Today</SectionLabel>
        <Card style={styles.stats}>
          <Stat label="Orders" value={stats ? String(stats.orders) : "–"} />
          <View style={styles.statDivider} />
          <Stat label="Sales" value={stats ? formatINR(stats.sales) : "–"} />
          <View style={styles.statDivider} />
          <Stat label="Visits" value={stats ? String(stats.visits) : "–"} />
        </Card>

        <SectionLabel>Quick actions</SectionLabel>
        <Action icon="bag-add-outline" label="New order" primary={onDuty} onPress={newOrder} />
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
  container: { padding: 16, gap: 14, paddingBottom: 32 },
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
  header: { marginTop: 6, marginBottom: 2 },
  date: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.text, marginTop: 4 },
  meta: { fontSize: 14, color: colors.textMuted, marginTop: 6 },
  dutyOn: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  dutyOff: { gap: 10, padding: 18 },
  dutyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dutyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  dutyHint: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: 2 },
  stats: { flexDirection: "row", padding: 0 },
  stat: { flex: 1, paddingVertical: 16, paddingHorizontal: 14, gap: 6 },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: 14 },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600", letterSpacing: 0.3 },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.text },
  actions: { flexDirection: "row", gap: 12 },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
});
