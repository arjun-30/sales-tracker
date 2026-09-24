import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../lib/api";
import type { Order } from "../lib/types";
import type { RootStackParamList } from "../navigation/types";
import { Card, EmptyState, Loading, StatusPill } from "../components/ui";
import { colors, formatDateTime, formatINR, radius } from "../theme";

export default function OrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  if (loading) return <Loading />;

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
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
        ListEmptyComponent={
          <EmptyState icon="receipt-outline" title="No orders yet" hint="Orders you take will show up here." />
        }
        renderItem={({ item }) => {
          const units = item.items.reduce((sum, i) => sum + i.quantity, 0);
          const products = item.items.map((i) => `${i.variant.product.shortCode} ${i.variant.sizeLabel}`);
          return (
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customer} numberOfLines={1}>
                    {item.customerName}
                  </Text>
                  {item.shopName ? (
                    <Text style={styles.shop} numberOfLines={1}>
                      {item.shopName}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.amount}>{formatINR(item.totalAmount)}</Text>
              </View>
              <Text style={styles.items} numberOfLines={2}>
                {units} {units === 1 ? "unit" : "units"} · {products.join(", ")}
              </Text>
              <View style={styles.row}>
                <StatusPill status={item.status} />
                <Text style={styles.date}>{formatDateTime(item.createdAt)}</Text>
              </View>
            </Card>
          );
        }}
      />
      <TouchableOpacity activeOpacity={0.85} style={styles.fab} onPress={() => navigation.navigate("NewOrder")}>
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.fabText}>New order</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  card: { gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  customer: { fontSize: 16, fontWeight: "700", color: colors.text },
  shop: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  amount: { fontSize: 17, fontWeight: "800", color: colors.text },
  items: { fontSize: 13, color: colors.textMuted },
  date: { fontSize: 12, color: colors.textFaint },
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
    borderRadius: radius.pill,
    elevation: 4,
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
