import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { Card, PaintStripe, SectionLabel } from "../components/ui";
import { colors, formatINR, paint, radius } from "../theme";

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
          <PaintStripe />
          <View style={styles.headerBody}>
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
            <View style={styles.districtRow}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text style={styles.district}>
                {[user?.employeeCode, user?.district?.name ?? "No district assigned"].filter(Boolean).join("  ·  ")}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={toggleDuty}
          disabled={busy}
          style={[styles.duty, onDuty ? styles.dutyOn : styles.dutyOff]}
        >
          <View style={[styles.dutyIcon, onDuty ? styles.dutyIconOn : styles.dutyIconOff]}>
            {busy ? (
              <ActivityIndicator color={onDuty ? colors.success : colors.ink} />
            ) : (
              <Ionicons name={onDuty ? "radio" : "power"} size={30} color={onDuty ? colors.success : colors.ink} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dutyTitle, onDuty ? { color: colors.success } : { color: "#fff" }]}>
              {onDuty ? "On duty" : "Off duty"}
            </Text>
            <Text style={[styles.dutyHint, !onDuty && { color: "#cbd5e1" }]}>
              {onDuty ? "Sharing your live location. Tap to go off duty." : "Tap to start your day and share location."}
            </Text>
          </View>
        </TouchableOpacity>

        <SectionLabel>Today</SectionLabel>
        <View style={styles.stats}>
          <Stat icon="receipt-outline" tint={paint[0]} label="Orders" value={stats ? String(stats.orders) : "–"} />
          <Stat icon="cash-outline" tint={paint[1]} label="Sales" value={stats ? formatINR(stats.sales) : "–"} />
          <Stat icon="storefront-outline" tint={paint[2]} label="Visits" value={stats ? String(stats.visits) : "–"} />
        </View>

        <SectionLabel>Quick actions</SectionLabel>
        <View style={styles.actions}>
          <Action icon="add" label="New order" tint={paint[4]} onPress={() => navigation.navigate("NewOrder")} />
          <Action icon="storefront" label="Shop visit" tint={paint[1]} onPress={() => navigation.navigate("Visits")} />
          <Action icon="pricetags" label="Price list" tint={paint[2]} onPress={() => navigation.navigate("Catalog")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  icon,
  tint,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tint: string;
  label: string;
  value: string;
}) {
  return (
    <Card style={[styles.stat, { borderTopColor: tint }]}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

function Action({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.action} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={24} color="#fff" />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 16, paddingBottom: 32 },
  header: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  headerBody: { padding: 18, paddingTop: 14 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  logo: { width: 120, height: 42 },
  date: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  greeting: { fontSize: 24, fontWeight: "800", color: colors.text, marginTop: 2 },
  districtRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  district: { fontSize: 14, color: colors.textMuted },
  logout: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  duty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  dutyOn: { backgroundColor: colors.successSoft, borderColor: colors.success },
  dutyOff: { backgroundColor: colors.ink, borderColor: colors.ink },
  dutyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  dutyIconOn: { backgroundColor: "#d1fae5" },
  dutyIconOff: { backgroundColor: "#fff" },
  dutyTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  dutyHint: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, padding: 14, gap: 4, borderTopWidth: 3 },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10 },
  action: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    paddingVertical: 18,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
});
