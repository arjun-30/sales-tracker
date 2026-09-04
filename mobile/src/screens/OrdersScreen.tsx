import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../lib/api";
import type { Order } from "../lib/types";
import type { RootStackParamList } from "../navigation/types";

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
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
        ListEmptyComponent={<Text style={styles.empty}>No orders yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.customer}>{item.customerName}</Text>
              <Text style={styles.amount}>₹{item.totalAmount.toFixed(2)}</Text>
            </View>
            {item.shopName ? <Text style={styles.shop}>{item.shopName}</Text> : null}
            <View style={styles.cardRow}>
              <Text style={[styles.status, statusStyle(item.status)]}>{item.status}</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
          </View>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("NewOrder")}>
        <Text style={styles.fabText}>+ New Order</Text>
      </TouchableOpacity>
    </View>
  );
}

function statusStyle(status: Order["status"]) {
  switch (status) {
    case "confirmed":
      return { color: "#2563eb" };
    case "delivered":
      return { color: "#16a34a" };
    case "cancelled":
      return { color: "#dc2626" };
    default:
      return { color: "#d97706" };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 40 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  customer: { fontSize: 16, fontWeight: "600" },
  amount: { fontSize: 16, fontWeight: "700", color: "#1d4ed8" },
  shop: { fontSize: 13, color: "#6b7280" },
  status: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  date: { fontSize: 12, color: "#9ca3af" },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "#1d4ed8",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
    elevation: 3,
  },
  fabText: { color: "#fff", fontWeight: "700" },
});
