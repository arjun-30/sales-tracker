import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../lib/api";
import type { Order, OrderStatus as Status } from "../lib/types";
import type { RootStackParamList } from "../navigation/types";
import { EmptyState, Loading, OrderStatus, SectionLabel } from "../components/ui";
import { colors, displayProductName, formatINR, formatTime, radius, statusTone } from "../theme";

type Tab = "all" | Status;

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

// Money that actually counts: cancelled orders are left out of totals.
const value = (orders: Order[]) =>
  orders.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + o.totalAmount, 0);

export default function OrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ orders: Order[] }>("/api/orders");
      setOrders(data.orders);
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

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: orders.length, pending: 0, confirmed: 0, delivered: 0, cancelled: 0 };
    for (const o of orders) c[o.status]++;
    return c;
  }, [orders]);

  const visible = useMemo(() => (tab === "all" ? orders : orders.filter((o) => o.status === tab)), [orders, tab]);

  const days = useMemo(() => {
    const groups: { label: string; orders: Order[] }[] = [];
    for (const o of visible) {
      const label = dayLabel(o.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.orders.push(o);
      else groups.push({ label, orders: [o] });
    }
    return groups;
  }, [visible]);

  if (loading) return <Loading />;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar} contentContainerStyle={styles.tabs}>
        {TABS.map((t) => {
          const active = t.value === tab;
          return (
            <TouchableOpacity key={t.value} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t.value)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              <Text style={[styles.tabCount, active && styles.tabTextActive]}>{counts[t.value]}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.list}
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
        {visible.length > 0 ? (
          <Text style={styles.summary}>
            {visible.length} {visible.length === 1 ? "order" : "orders"}
            {tab !== "cancelled" ? `  ·  ${formatINR(value(visible))}` : ""}
          </Text>
        ) : null}

        {visible.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title={tab === "all" ? "No orders yet" : `No ${statusTone[tab].label.toLowerCase()} orders`}
            hint={tab === "all" ? "Orders you take will show up here." : undefined}
          />
        ) : null}

        {days.map((day) => (
          <View key={day.label} style={styles.day}>
            <View style={styles.dayHeader}>
              <SectionLabel>{day.label}</SectionLabel>
              <Text style={styles.dayTotal}>{formatINR(value(day.orders))}</Text>
            </View>
            <View style={styles.group}>
              {day.orders.map((o, i) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  first={i === 0}
                  expanded={expandedId === o.id}
                  onToggle={() => setExpandedId(expandedId === o.id ? null : o.id)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity activeOpacity={0.85} style={styles.fab} onPress={() => navigation.navigate("NewOrder")}>
        <Ionicons name="bag-add-outline" size={20} color="#fff" />
        <Text style={styles.fabText}>New order</Text>
      </TouchableOpacity>
    </View>
  );
}

function OrderRow({
  order,
  first,
  expanded,
  onToggle,
}: {
  order: Order;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const lead = order.items[0];
  const units = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const cancelled = order.status === "cancelled";

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onToggle} style={[styles.order, !first && styles.orderDivider]}>
      <View style={styles.orderTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.customer} numberOfLines={1}>
            {order.customerName}
          </Text>
          {order.shopName ? (
            <Text style={styles.shop} numberOfLines={1}>
              {order.shopName}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.amount, cancelled && styles.amountCancelled]}>{formatINR(order.totalAmount)}</Text>
      </View>

      {lead && !expanded ? (
        <Text style={styles.items} numberOfLines={1}>
          {displayProductName(lead.variant.product.name)} {lead.variant.sizeLabel} × {lead.quantity}
          {order.items.length > 1 ? `  ·  +${order.items.length - 1} more` : ""}
        </Text>
      ) : null}

      {expanded ? (
        <View style={styles.lines}>
          {order.items.map((i) => (
            <View key={i.id} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName} numberOfLines={2}>
                  {displayProductName(i.variant.product.name)}
                </Text>
                <Text style={styles.lineMeta}>
                  {i.variant.sizeLabel} · {i.quantity} × {formatINR(i.unitPrice)}
                </Text>
              </View>
              <Text style={styles.lineTotal}>{formatINR(i.unitPrice * i.quantity)}</Text>
            </View>
          ))}
          {order.notes ? <Text style={styles.notes}>Note: {order.notes}</Text> : null}
        </View>
      ) : null}

      <View style={styles.orderBottom}>
        <OrderStatus status={order.status} />
        <Text style={styles.meta}>
          {units} {units === 1 ? "unit" : "units"}  ·  {formatTime(order.createdAt)}
        </Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabsBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background },
  tabs: { paddingHorizontal: 12, gap: 2 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.text },
  tabText: { fontSize: 14, fontWeight: "500", color: colors.textMuted },
  tabCount: { fontSize: 12, color: colors.textFaint, fontVariant: ["tabular-nums"] },
  tabTextActive: { color: colors.text, fontWeight: "700" },
  list: { padding: 16, gap: 18, paddingBottom: 110 },
  summary: { fontSize: 13, color: colors.textMuted, fontWeight: "600", marginBottom: -6 },
  day: { gap: 8 },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  dayTotal: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  order: { paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  orderDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  orderTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  customer: { fontSize: 15, fontWeight: "600", color: colors.text },
  shop: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  amountCancelled: { color: colors.textFaint, textDecorationLine: "line-through" },
  items: { fontSize: 13, color: colors.textMuted },
  lines: { gap: 10, paddingTop: 4, paddingBottom: 2, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 2 },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingTop: 6 },
  lineName: { fontSize: 14, color: colors.text, fontWeight: "500" },
  lineMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  lineTotal: { fontSize: 14, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
  notes: { fontSize: 13, color: colors.textMuted },
  orderBottom: { flexDirection: "row", alignItems: "center", gap: 10 },
  meta: { flex: 1, fontSize: 12, color: colors.textFaint, textAlign: "right" },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: radius.md,
    elevation: 4,
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
