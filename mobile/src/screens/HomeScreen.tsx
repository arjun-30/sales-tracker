import React, { useCallback, useState } from "react";
import {
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
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Image source={require("../../assets/roalux-logo.png")} style={styles.logo} resizeMode="contain" />
            <TouchableOpacity style={styles.logout} onPress={logout} accessibilityLabel="Log out">
              <Ionicons name="log-out-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.date}>{today}</Text>
          <Text style={styles.greeting}>
            {greeting()}, {user?.name?.split(" ")[0]}
          </Text>
          <Text style={styles.district}>
            {[user?.employeeCode, user?.district?.name ?? "No district assigned"].filter(Boolean).join("  ·  ")}
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
              : "Start duty to share your location and log shop visits."}
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
        <Card style={styles.actions}>
          <Action icon="add-circle-outline" label="New order" onPress={() => navigation.navigate("NewOrder")} />
          <View style={styles.actionDivider} />
          <Action icon="storefront-outline" label="Shop visit" onPress={() => navigation.navigate("Visits")} />
          <View style={styles.actionDivider} />
          <Action icon="pricetags-outline" label="Price list" onPress={() => navigation.navigate("Catalog")} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
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
    <TouchableOpacity activeOpacity={0.6} style={styles.action} onPress={onPress}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={20} color={colors.text} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 14, paddingBottom: 32 },
  header: { paddingTop: 4, paddingBottom: 6 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  logo: { width: 104, height: 36 },
  date: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.text, marginTop: 2 },
  district: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  logout: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  duty: { gap: 10, padding: 18 },
  dutyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dutyTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  dutyHint: { fontSize: 14, color: colors.textMuted, marginBottom: 4 },
  stats: { flexDirection: "row", padding: 0 },
  stat: { flex: 1, paddingVertical: 16, paddingHorizontal: 12, gap: 2 },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: 12 },
  statValue: { fontSize: 20, fontWeight: "700", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  actions: { padding: 0 },
  action: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16 },
  actionDivider: { height: 1, backgroundColor: colors.border, marginLeft: 66 },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
});
