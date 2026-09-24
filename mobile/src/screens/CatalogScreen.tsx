import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../lib/api";
import type { Product } from "../lib/types";

const ALL = "All";

function formatPrice(price: number) {
  return `₹${price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function CatalogScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);

  // Reload on every visit so price changes made on the dashboard show up.
  const load = useCallback(async () => {
    try {
      const data = await api<{ products: Product[] }>("/api/products");
      setProducts(data.products);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the catalogue");
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

  const categories = useMemo(
    () => [ALL, ...Array.from(new Set(products.map((p) => p.category))).sort()],
    [products]
  );

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = products.filter(
      (p) =>
        p.variants.length > 0 &&
        (category === ALL || p.category === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.shortCode.toLowerCase().includes(q))
    );
    const byCategory = new Map<string, Product[]>();
    for (const p of matches) {
      byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);
    }
    return Array.from(byCategory.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
  }, [products, query, category]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <TextInput
          style={styles.search}
          placeholder="Search name or code (e.g. RPE)"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {categories.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, c === category && styles.chipActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.chipText, c === category && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10 }}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
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
          <Text style={styles.empty}>{query || category !== ALL ? "No matching products." : "No products yet."}</Text>
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.code}>{item.shortCode}</Text>
            </View>
            <View style={styles.variants}>
              {item.variants.map((v) => (
                <View key={v.id} style={styles.variant}>
                  <Text style={styles.size}>{v.sizeLabel}</Text>
                  {v.price > 0 ? (
                    <Text style={styles.price}>{formatPrice(v.price)}</Text>
                  ) : (
                    <Text style={styles.noPrice}>Price not set</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  filters: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  search: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  chips: { gap: 8, paddingBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#1d4ed8", borderColor: "#1d4ed8" },
  chipText: { fontSize: 14, color: "#374151" },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  error: { color: "#dc2626", paddingHorizontal: 16, paddingTop: 8 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    marginTop: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { fontSize: 16, fontWeight: "600", flexShrink: 1 },
  code: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1d4ed8",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  variants: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  variant: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 84,
  },
  size: { fontSize: 13, color: "#6b7280" },
  price: { fontSize: 15, fontWeight: "700", color: "#111827" },
  noPrice: { fontSize: 12, color: "#9ca3af", fontStyle: "italic" },
});
