import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../lib/api";
import { getCurrentPosition } from "../lib/locationTask";
import type { Order, Product } from "../lib/types";
import type { RootStackParamList } from "../navigation/types";

interface CartLine {
  variantId: string;
  productName: string;
  sizeLabel: string;
  unitPrice: number;
  quantity: number;
}

export default function NewOrderScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [notes, setNotes] = useState("");

  async function handleLookup() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLooking(true);
    setFound(null);
    setNotFound(false);
    try {
      const data = await api<{ product: Product }>(`/api/products/lookup/${encodeURIComponent(trimmed)}`);
      setFound(data.product);
      setSizeQuantities({});
    } catch {
      setNotFound(true);
    } finally {
      setLooking(false);
    }
  }

  function addToCart() {
    if (!found) return;
    const lines: CartLine[] = [];
    for (const v of found.variants) {
      const qty = Number(sizeQuantities[v.id] ?? 0);
      if (qty > 0) {
        lines.push({
          variantId: v.id,
          productName: found.name,
          sizeLabel: v.sizeLabel,
          unitPrice: v.price,
          quantity: qty,
        });
      }
    }
    if (lines.length === 0) {
      Alert.alert("No quantity", "Enter a quantity for at least one size.");
      return;
    }
    setCart((prev) => {
      const next = [...prev];
      for (const line of lines) {
        const existingIdx = next.findIndex((l) => l.variantId === line.variantId);
        if (existingIdx >= 0) {
          next[existingIdx] = { ...next[existingIdx], quantity: next[existingIdx].quantity + line.quantity };
        } else {
          next.push(line);
        }
      }
      return next;
    });
    setFound(null);
    setCode("");
    setSizeQuantities({});
  }

  function removeLine(variantId: string) {
    setCart((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  const total = useMemo(() => cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0), [cart]);

  async function handleSubmit() {
    if (!customerName.trim()) {
      Alert.alert("Missing info", "Customer name is required.");
      return;
    }
    if (cart.length === 0) {
      Alert.alert("Missing info", "Add at least one product.");
      return;
    }

    setSubmitting(true);
    try {
      const pos = await getCurrentPosition();
      await api<{ order: Order }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          shopName: shopName.trim() || undefined,
          notes: notes.trim() || undefined,
          lat: pos?.lat,
          lng: pos?.lng,
          items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        }),
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={cart}
        keyExtractor={(item) => item.variantId}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 160 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 12 }}>
            <TextInput
              style={styles.input}
              placeholder="Customer name *"
              value={customerName}
              onChangeText={setCustomerName}
            />
            <TextInput
              style={styles.input}
              placeholder="Customer phone"
              keyboardType="phone-pad"
              value={customerPhone}
              onChangeText={setCustomerPhone}
            />
            <TextInput
              style={styles.input}
              placeholder="Shop name"
              value={shopName}
              onChangeText={setShopName}
            />
            <TextInput style={styles.input} placeholder="Notes" value={notes} onChangeText={setNotes} />

            <Text style={styles.sectionLabel}>Add a product</Text>
            <View style={styles.codeRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Type product code, e.g. RPE"
                autoCapitalize="characters"
                value={code}
                onChangeText={setCode}
                onSubmitEditing={handleLookup}
              />
              <TouchableOpacity style={styles.lookupButton} onPress={handleLookup} disabled={looking}>
                {looking ? <ActivityIndicator color="#fff" /> : <Text style={styles.lookupButtonText}>Find</Text>}
              </TouchableOpacity>
            </View>

            {notFound && <Text style={styles.errorText}>No product found for that code.</Text>}

            {found && (
              <View style={styles.foundCard}>
                <Text style={styles.foundName}>
                  {found.name} <Text style={styles.foundCode}>({found.shortCode})</Text>
                </Text>
                {found.variants.map((v) => (
                  <View key={v.id} style={styles.sizeRow}>
                    <Text style={styles.sizeLabel}>{v.sizeLabel}</Text>
                    <Text style={styles.sizePrice}>₹{v.price}</Text>
                    <TextInput
                      style={styles.qtyInput}
                      placeholder="0"
                      keyboardType="numeric"
                      value={sizeQuantities[v.id] ?? ""}
                      onChangeText={(text) =>
                        setSizeQuantities((prev) => ({ ...prev, [v.id]: text.replace(/[^0-9]/g, "") }))
                      }
                    />
                  </View>
                ))}
                <TouchableOpacity style={styles.addButton} onPress={addToCart}>
                  <Text style={styles.addButtonText}>Add to order</Text>
                </TouchableOpacity>
              </View>
            )}

            {cart.length > 0 && <Text style={styles.sectionLabel}>Order items</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.cartRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>
                {item.productName} ({item.sizeLabel})
              </Text>
              <Text style={styles.productMeta}>
                {item.quantity} × ₹{item.unitPrice} = ₹{(item.quantity * item.unitPrice).toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity onPress={() => removeLine(item.variantId)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <View style={styles.footer}>
        <Text style={styles.totalText}>Total: ₹{total.toFixed(2)}</Text>
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Submit order</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: "#6b7280", marginTop: 4 },
  codeRow: { flexDirection: "row", gap: 8 },
  lookupButton: {
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  lookupButtonText: { color: "#fff", fontWeight: "700" },
  errorText: { color: "#dc2626", fontSize: 13 },
  foundCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  foundName: { fontSize: 15, fontWeight: "700" },
  foundCode: { fontWeight: "400", color: "#6b7280" },
  sizeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sizeLabel: { width: 48, fontWeight: "600" },
  sizePrice: { flex: 1, color: "#6b7280", fontSize: 13 },
  qtyInput: {
    width: 60,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    textAlign: "center",
    paddingVertical: 8,
  },
  addButton: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  addButtonText: { color: "#fff", fontWeight: "700" },
  cartRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
  },
  productName: { fontSize: 15, fontWeight: "600" },
  productMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  removeText: { color: "#dc2626", fontWeight: "600", fontSize: 13 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    padding: 16,
    gap: 10,
  },
  totalText: { fontSize: 16, fontWeight: "700" },
  submitButton: { backgroundColor: "#1d4ed8", borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
