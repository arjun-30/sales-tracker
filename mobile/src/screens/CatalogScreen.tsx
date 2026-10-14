import React, { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../lib/api";
import type { Product } from "../lib/types";
import { EmptyState, Loading } from "../components/ui";
import { colors, displayProductName, formatINR, radius } from "../theme";

const ALL = "All";

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
      setError(err instanceof Error ? err.message : "Could not load the price list");
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

  if (loading) return <Loading />;

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <View style={styles.search}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search product or code"
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </TouchableOpacity>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {categories.map((c) => {
            const active = c === category;
            return (
              <TouchableOpacity key={c} style={[styles.tab, active && styles.tabActive]} onPress={() => setCategory(c)}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
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
          <EmptyState
            icon="pricetags-outline"
            title={query || category !== ALL ? "No matching products" : "No products yet"}
            hint={query ? "Try part of the name or the short code." : undefined}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>
              {section.data.length} {section.data.length === 1 ? "product" : "products"}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          // A product sold in one standard size shows its price on the name line.
          const single = item.variants.length === 1 ? item.variants[0] : null;
          return (
          <View style={styles.card}>
            <View style={[styles.cardHeader, single && { paddingBottom: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {displayProductName(item.name)}
                </Text>
                {single ? (
                  <Text style={styles.code}>
                    {item.shortCode} · {single.sizeLabel === "STD" ? "Standard pack" : single.sizeLabel}
                  </Text>
                ) : null}
              </View>
              {single ? (
                single.price > 0 ? (
                  <Text style={styles.amount}>{formatINR(single.price)}</Text>
                ) : (
                  <Text style={styles.noPrice}>Not set</Text>
                )
              ) : (
                <Text style={styles.code}>{item.shortCode}</Text>
              )}
            </View>
            {single ? null : (
            <View style={styles.prices}>
              {item.variants.map((v, i) => (
                <View key={v.id} style={[styles.price, i > 0 && styles.priceDivider]}>
                  <Text style={styles.size}>{v.sizeLabel}</Text>
                  {v.price > 0 ? (
                    <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
                      {formatINR(v.price)}
                    </Text>
                  ) : (
                    <Text style={styles.noPrice}>Not set</Text>
                  )}
                </View>
              ))}
            </View>
            )}
          </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: 16, paddingTop: 12, gap: 6, backgroundColor: colors.background },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 12, color: colors.text },
  tabs: { gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  tabActive: { borderBottomColor: colors.text },
  tabText: { fontSize: 14, fontWeight: "500", color: colors.textMuted },
  tabTextActive: { color: colors.text, fontWeight: "700" },
  error: { color: colors.danger, paddingHorizontal: 16, paddingTop: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 14,
    marginBottom: 2,
  },
  sectionTitle: { fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  sectionCount: { fontSize: 12, color: colors.textFaint },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  name: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
  code: { fontSize: 12, fontWeight: "600", color: colors.textMuted, letterSpacing: 0.8 },
  prices: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border },
  price: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, gap: 2 },
  priceDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  size: { fontSize: 12, color: colors.textMuted, fontWeight: "500" },
  amount: { fontSize: 15, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  noPrice: { fontSize: 13, color: colors.textFaint },
});
