import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../lib/api";
import { getCurrentPosition } from "../lib/locationTask";
import type { Order, Product } from "../lib/types";
import type { RootStackParamList } from "../navigation/types";
import { Button, Card, Field, SectionLabel } from "../components/ui";
import { colors, formatINR, radius } from "../theme";

interface CartLine {
  variantId: string;
  productName: string;
  shortCode: string;
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
  const [draftQty, setDraftQty] = useState<Record<string, number>>({});
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
      setDraftQty({});
    } catch {
      setNotFound(true);
    } finally {
      setLooking(false);
    }
  }

  function addToCart() {
    if (!found) return;
    const lines: CartLine[] = found.variants
      .filter((v) => (draftQty[v.id] ?? 0) > 0)
      .map((v) => ({
        variantId: v.id,
        productName: found.name,
        shortCode: found.shortCode,
        sizeLabel: v.sizeLabel,
        unitPrice: v.price,
        quantity: draftQty[v.id],
      }));
    if (lines.length === 0) {
      Alert.alert("No quantity", "Use + to add at least one pack.");
      return;
    }
    setCart((prev) => {
      const next = [...prev];
      for (const line of lines) {
        const i = next.findIndex((l) => l.variantId === line.variantId);
        if (i >= 0) next[i] = { ...next[i], quantity: next[i].quantity + line.quantity };
        else next.push(line);
      }
      return next;
    });
    setFound(null);
    setCode("");
    setDraftQty({});
  }

  function setLineQty(variantId: string, quantity: number) {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.variantId !== variantId)
        : prev.map((l) => (l.variantId === variantId ? { ...l, quantity } : l))
    );
  }

  const total = useMemo(() => cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0), [cart]);
  const units = useMemo(() => cart.reduce((sum, l) => sum + l.quantity, 0), [cart]);

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
      const { order } = await api<{ order: Order }>("/api/orders", {
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
      Alert.alert("Order placed", `${order.customerName} · ${formatINR(order.totalAmount)}`);
      navigation.goBack();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionLabel>Customer</SectionLabel>
          <Card style={styles.section}>
            <Field icon="person-outline" placeholder="Customer name *" value={customerName} onChangeText={setCustomerName} />
            <Field
              icon="call-outline"
              placeholder="Phone (optional)"
              keyboardType="phone-pad"
              value={customerPhone}
              onChangeText={setCustomerPhone}
            />
            <Field icon="storefront-outline" placeholder="Shop name (optional)" value={shopName} onChangeText={setShopName} />
            <Field icon="create-outline" placeholder="Notes (optional)" value={notes} onChangeText={setNotes} />
          </Card>

          <SectionLabel>Add products</SectionLabel>
          <Card style={styles.section}>
            <View style={styles.codeRow}>
              <View style={{ flex: 1 }}>
                <Field
                  icon="search-outline"
                  placeholder="Product code, e.g. RPE"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={code}
                  onChangeText={(t) => {
                    setCode(t);
                    setNotFound(false);
                  }}
                  onSubmitEditing={handleLookup}
                  returnKeyType="search"
                />
              </View>
              <TouchableOpacity style={styles.findButton} onPress={handleLookup} disabled={looking || !code.trim()}>
                {looking ? <ActivityIndicator color="#fff" /> : <Text style={styles.findText}>Find</Text>}
              </TouchableOpacity>
            </View>

            {notFound ? (
              <View style={styles.notFound}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                <Text style={styles.notFoundText}>No active product with that code. Check the Price List tab.</Text>
              </View>
            ) : null}

            {found ? (
              <View style={styles.found}>
                <View style={styles.foundHeader}>
                  <Text style={styles.foundName}>{found.name}</Text>
                  <Text style={styles.code}>{found.shortCode}</Text>
                </View>
                {found.variants.map((v) => (
                  <View key={v.id} style={styles.sizeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sizeLabel}>{v.sizeLabel}</Text>
                      <Text style={v.price > 0 ? styles.sizePrice : styles.noPrice}>
                        {v.price > 0 ? formatINR(v.price) : "Price not set"}
                      </Text>
                    </View>
                    <Stepper
                      value={draftQty[v.id] ?? 0}
                      onChange={(q) => setDraftQty((prev) => ({ ...prev, [v.id]: q }))}
                    />
                  </View>
                ))}
                <Button label="Add to order" icon="cart-outline" variant="success" onPress={addToCart} />
              </View>
            ) : null}
          </Card>

          {cart.length > 0 ? (
            <>
              <SectionLabel>Order items</SectionLabel>
              <Card style={{ paddingVertical: 4 }}>
                {cart.map((l, i) => (
                  <View key={l.variantId} style={[styles.cartRow, i > 0 && styles.cartDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartName} numberOfLines={1}>
                        {l.productName}
                      </Text>
                      <Text style={styles.cartMeta}>
                        {l.shortCode} · {l.sizeLabel} · {formatINR(l.unitPrice)} each
                      </Text>
                      <Text style={styles.cartLineTotal}>{formatINR(l.unitPrice * l.quantity)}</Text>
                    </View>
                    <Stepper value={l.quantity} onChange={(q) => setLineQty(l.variantId, q)} removable />
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <View style={{ flex: 1 }}>
            <Text style={styles.footerLabel}>
              {units} {units === 1 ? "unit" : "units"}
            </Text>
            <Text style={styles.footerTotal}>{formatINR(total)}</Text>
          </View>
          <Button
            label="Place order"
            icon="checkmark-circle"
            onPress={handleSubmit}
            loading={submitting}
            disabled={cart.length === 0}
            style={{ flex: 1.3 }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Stepper({
  value,
  onChange,
  removable,
}: {
  value: number;
  onChange: (v: number) => void;
  // In the cart, going below 1 removes the line, so show a bin instead of a minus.
  removable?: boolean;
}) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={styles.stepBtn}
        onPress={() => onChange(Math.max(0, value - 1))}
        accessibilityLabel="Decrease"
      >
        <Ionicons
          name={removable && value <= 1 ? "trash-outline" : "remove"}
          size={20}
          color={removable && value <= 1 ? colors.danger : colors.text}
        />
      </TouchableOpacity>
      <TextInput
        style={styles.stepValue}
        keyboardType="number-pad"
        value={value ? String(value) : ""}
        placeholder="0"
        placeholderTextColor={colors.textFaint}
        onChangeText={(t) => onChange(Number(t.replace(/[^0-9]/g, "") || 0))}
      />
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(value + 1)} accessibilityLabel="Increase">
        <Ionicons name="add" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  section: { gap: 12 },
  codeRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  findButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 50,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  findText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  notFound: { flexDirection: "row", gap: 8, alignItems: "center" },
  notFoundText: { color: colors.danger, fontSize: 13, flex: 1 },
  found: { gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  foundHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  foundName: { fontSize: 16, fontWeight: "700", color: colors.text, flexShrink: 1 },
  code: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sizeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sizeLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  sizePrice: { fontSize: 13, color: colors.textMuted },
  noPrice: { fontSize: 12, color: colors.textFaint, fontStyle: "italic" },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  stepBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  stepValue: { width: 48, textAlign: "center", fontSize: 16, fontWeight: "700", color: colors.text, paddingVertical: 0 },
  cartRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  cartDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  cartName: { fontSize: 15, fontWeight: "700", color: colors.text },
  cartMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cartLineTotal: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 4 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footerLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  footerTotal: { fontSize: 22, fontWeight: "800", color: colors.text },
});
