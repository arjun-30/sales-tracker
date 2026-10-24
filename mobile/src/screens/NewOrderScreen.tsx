import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { useDuty } from "../context/DutyContext";
import { getCurrentPosition } from "../lib/locationTask";
import { distanceKm, formatKm, type LatLng } from "../lib/geo";
import type { Order, Product, Store } from "../lib/types";
import type { RootStackParamList } from "../navigation/types";
import { Button, Card, Field } from "../components/ui";
import { VOICE_NOTE_MIME, VoiceRecorder, type RecordedNote } from "../components/VoiceNote";
import { colors, displayProductName, formatINR, radius } from "../theme";

// A catalogue size (variantId), or a custom size the salesperson describes and
// prices at the shop: of a catalogue product (productId) or one they name.
interface CartLine {
  key: string;
  variantId?: string;
  productId?: string;
  productName: string;
  sizeLabel: string;
  unitPrice: number;
  quantity: number;
  custom: boolean;
}

// The custom-item form: product fixed when it came from the catalogue.
interface CustomDraft {
  productId?: string;
  productName: string;
  size: string;
  quantity: number;
  price: string;
}

const MAX_RESULTS = 6;
// An in-person order this far from its shop was probably taken somewhere else.
const FAR_FROM_STORE_KM = 0.3;
let customSeq = 0;

export default function NewOrderScreen() {
  const { onDuty, busy: dutyBusy, toggleDuty } = useDuty();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [catalog, setCatalog] = useState<Product[] | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Product | null>(null);
  const [draftQty, setDraftQty] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [notes, setNotes] = useState("");
  const [voiceNote, setVoiceNote] = useState<RecordedNote | null>(null);
  const [channel, setChannel] = useState<"in_person" | "phone">("in_person");
  const [stores, setStores] = useState<Store[]>([]);
  const [here, setHere] = useState<LatLng | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [pickingStore, setPickingStore] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");
  const [customDraft, setCustomDraft] = useState<CustomDraft | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const productsY = useRef(0);
  // Bring the product search above the keyboard when it is tapped.
  const revealProducts = () =>
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, productsY.current - 8), animated: true }), 250);

  // The whole price list is small (a few dozen products), so load it once and
  // search it on the phone: salespeople type part of a name, not a code.
  useEffect(() => {
    api<{ products: Product[] }>("/api/products")
      .then((d) => setCatalog(d.products.filter((p) => p.variants.length > 0)))
      .catch(() => setCatalog([]));
    // The plant's shops, nearest first, to pick the one the order is for.
    api<{ stores: Store[] }>("/api/stores")
      .then((d) => setStores(d.stores))
      .catch(() => {});
    getCurrentPosition().then(setHere);
  }, []);

  const storeMatches = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    const list = stores
      .filter((s) => !q || [s.name, s.ownerName, s.address, s.phone].some((v) => v?.toLowerCase().includes(q)))
      .map((s) => ({ store: s, km: here ? distanceKm(here, s) : null }));
    if (here) list.sort((a, b) => a.km! - b.km!);
    return list.slice(0, 8);
  }, [stores, storeQuery, here]);

  function chooseStore(s: Store) {
    Keyboard.dismiss();
    setStore(s);
    setShopName(s.name);
    if (!customerName.trim()) setCustomerName(s.ownerName || s.name);
    if (!customerPhone && s.phone) setCustomerPhone(s.phone);
    setPickingStore(false);
    setStoreQuery("");
  }

  // How far the phone is from the chosen shop, for an order taken in person.
  const storeKm = store && here ? distanceKm(here, store) : null;
  const farFromStore = channel === "in_person" && storeKm !== null && storeKm > FAR_FROM_STORE_KM;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !catalog) return [];
    const exact = catalog.filter((p) => p.shortCode.toLowerCase() === q);
    const rest = catalog.filter(
      (p) => p.shortCode.toLowerCase() !== q && (p.name.toLowerCase().includes(q) || p.shortCode.toLowerCase().startsWith(q))
    );
    return [...exact, ...rest].slice(0, MAX_RESULTS);
  }, [query, catalog]);

  function pick(product: Product) {
    Keyboard.dismiss();
    setFound(product);
    setDraftQty({});
    setQuery("");
  }

  function addToCart() {
    if (!found) return;
    const lines: CartLine[] = found.variants
      .filter((v) => (draftQty[v.id] ?? 0) > 0)
      .map((v) => ({
        key: v.id,
        variantId: v.id,
        productName: found.name,
        sizeLabel: v.sizeLabel,
        unitPrice: v.price,
        quantity: draftQty[v.id],
        custom: false,
      }));
    if (lines.length === 0) {
      Alert.alert("No quantity", "Use + to add at least one pack.");
      return;
    }
    setCart((prev) => {
      const next = [...prev];
      for (const line of lines) {
        const i = next.findIndex((l) => l.key === line.key);
        if (i >= 0) next[i] = { ...next[i], quantity: next[i].quantity + line.quantity };
        else next.push(line);
      }
      return next;
    });
    setFound(null);
    setDraftQty({});
  }

  // Start a custom size: of the product on screen, or of one the customer
  // asked for that isn't in the catalogue (named from what was searched).
  function startCustom(product?: Product) {
    Keyboard.dismiss();
    setCustomDraft({
      productId: product?.id,
      productName: product ? product.name : query.trim(),
      size: "",
      quantity: 1,
      price: "",
    });
    setFound(null);
    setQuery("");
  }

  function addCustom() {
    if (!customDraft) return;
    const price = Number(customDraft.price);
    if (!customDraft.productName.trim()) {
      Alert.alert("Product needed", "Enter what the customer wants.");
      return;
    }
    if (!customDraft.size.trim()) {
      Alert.alert("Size needed", "Enter the size or pack, e.g. 15 L or 2 kg.");
      return;
    }
    if (!(price > 0)) {
      Alert.alert("Price needed", "Enter the price agreed for one pack.");
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        key: `custom-${++customSeq}`,
        productId: customDraft.productId,
        productName: customDraft.productName.trim(),
        sizeLabel: customDraft.size.trim(),
        unitPrice: Math.round(price * 100) / 100,
        quantity: customDraft.quantity,
        custom: true,
      },
    ]);
    setCustomDraft(null);
  }

  function setLineQty(key: string, quantity: number) {
    setCart((prev) =>
      quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity } : l))
    );
  }

  const total = useMemo(() => cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0), [cart]);
  const units = useMemo(() => cart.reduce((sum, l) => sum + l.quantity, 0), [cart]);
  const draftCount = Object.values(draftQty).reduce((sum, q) => sum + q, 0);

  async function handleSubmit() {
    if (!customerName.trim()) {
      Alert.alert("Customer name needed", "Enter who this order is for.");
      return;
    }
    if (cart.length === 0) {
      Alert.alert("No products yet", "Add at least one product to the order.");
      return;
    }

    setSubmitting(true);
    try {
      const pos = await getCurrentPosition();
      const payload = JSON.stringify({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        shopName: shopName.trim() || undefined,
        notes: notes.trim() || undefined,
        lat: pos?.lat,
        lng: pos?.lng,
        voiceNoteDurationMs: voiceNote?.durationMs,
        channel,
        storeId: store?.id,
        items: cart.map((l) =>
          l.custom
            ? {
                ...(l.productId ? { productId: l.productId } : { customName: l.productName }),
                customSize: l.sizeLabel,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
              }
            : { variantId: l.variantId, quantity: l.quantity }
        ),
      });
      // With a voice note the order goes as multipart: the JSON plus the file.
      let body: string | FormData = payload;
      if (voiceNote) {
        const form = new FormData();
        form.append("order", payload);
        // React Native's FormData takes a file as { uri, name, type }.
        form.append("voiceNote", { uri: voiceNote.uri, name: "voice-note.m4a", type: VOICE_NOTE_MIME } as unknown as Blob);
        body = form;
      }
      const { order } = await api<{ order: Order }>("/api/orders", { method: "POST", body });
      Alert.alert("Order placed", `${order.customerName} · ${formatINR(order.totalAmount)}`);
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't place the order", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // The server refuses orders from anyone off duty; say so up front instead
  // of letting them fill in an order that can't be sent.
  if (!onDuty) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={styles.offDuty}>
          <Ionicons name="time-outline" size={36} color={colors.textMuted} />
          <Text style={styles.offDutyTitle}>You're off duty</Text>
          <Text style={styles.offDutyText}>Start duty to take orders. Orders are recorded against your working day.</Text>
          <Button label="Start duty" onPress={toggleDuty} loading={dutyBusy} style={{ alignSelf: "stretch" }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Step number={1} title="Customer" />
          <Card style={styles.card}>
            <View>
              <Text style={styles.fixedLabel}>How was this order taken?</Text>
              <View style={styles.segment}>
                {(
                  [
                    ["in_person", "At the shop", "storefront-outline"],
                    ["phone", "Over the phone", "call-outline"],
                  ] as const
                ).map(([value, label, icon]) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.segmentItem, channel === value && styles.segmentOn]}
                    onPress={() => setChannel(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: channel === value }}
                  >
                    <Ionicons name={icon} size={17} color={channel === value ? "#fff" : colors.text} />
                    <Text style={[styles.segmentText, channel === value && { color: "#fff" }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={styles.fixedLabel}>Shop</Text>
              {store && !pickingStore ? (
                <View style={styles.storeChosen}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {store.name}
                    </Text>
                    <Text style={styles.resultMeta} numberOfLines={1}>
                      {[storeKm !== null ? `${formatKm(storeKm)} from you` : null, store.address].filter(Boolean).join("  ·  ")}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setPickingStore(true)} hitSlop={10}>
                    <Text style={styles.customLinkText}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : pickingStore || stores.length > 0 ? (
                <>
                  <Field
                    icon="search-outline"
                    placeholder="Search shops on the map"
                    value={storeQuery}
                    onChangeText={setStoreQuery}
                    onFocus={() => setPickingStore(true)}
                    autoCorrect={false}
                  />
                  {pickingStore ? (
                    <View style={styles.results}>
                      {storeMatches.map(({ store: s, km }, i) => (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.result, i > 0 && styles.resultDivider]}
                          onPress={() => chooseStore(s)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.resultName} numberOfLines={1}>
                              {s.name}
                            </Text>
                            <Text style={styles.resultMeta} numberOfLines={1}>
                              {[km !== null ? formatKm(km) : null, s.ownerName, s.status === "pending" ? "waiting for approval" : null]
                                .filter(Boolean)
                                .join("  ·  ")}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.result, storeMatches.length > 0 && styles.resultDivider]}
                        onPress={() => {
                          setPickingStore(false);
                          setStore(null);
                        }}
                      >
                        <Text style={styles.resultMeta}>Not on the map: type the shop name below</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </>
              ) : null}
              {!store ? (
                <Field placeholder="Shop name, if it isn't on the map" value={shopName} onChangeText={setShopName} />
              ) : null}
              {farFromStore ? (
                <Text style={styles.farWarning}>
                  You are {formatKm(storeKm!)} from this shop. If the customer gave this order over the phone, choose
                  “Over the phone”. The office sees how far you were.
                </Text>
              ) : null}
            </View>

            <Field label="Customer name" placeholder="Who is the order for?" value={customerName} onChangeText={setCustomerName} />
            <Field
              label="Mobile number (optional)"
              placeholder="98765 43210"
              keyboardType="number-pad"
              maxLength={10}
              value={customerPhone}
              onChangeText={(t) => setCustomerPhone(t.replace(/\D/g, ""))}
            />
            <Field label="Notes (optional)" placeholder="Delivery date, credit terms…" value={notes} onChangeText={setNotes} />
            <VoiceRecorder value={voiceNote} onChange={setVoiceNote} />
          </Card>

          <View onLayout={(e) => (productsY.current = e.nativeEvent.layout.y)}>
            <Step number={2} title="Products" />
          </View>
          <Card style={styles.card}>
            {customDraft ? (
              <View style={{ gap: 14 }}>
                <View style={styles.foundHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.foundName}>Custom item</Text>
                    <Text style={styles.foundCode}>A size or pack not in the price list, at the price agreed here</Text>
                  </View>
                  <TouchableOpacity onPress={() => setCustomDraft(null)} hitSlop={10} accessibilityLabel="Cancel custom item">
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                {customDraft.productId ? (
                  <View>
                    <Text style={styles.fixedLabel}>Product</Text>
                    <Text style={styles.fixedValue}>{displayProductName(customDraft.productName)}</Text>
                  </View>
                ) : (
                  <Field
                    label="Product"
                    placeholder="What the customer wants"
                    value={customDraft.productName}
                    onChangeText={(t) => setCustomDraft({ ...customDraft, productName: t })}
                  />
                )}
                <Field
                  label="Size or pack"
                  placeholder="e.g. 15 L, 2 kg, 6 × 1 L"
                  value={customDraft.size}
                  onChangeText={(t) => setCustomDraft({ ...customDraft, size: t })}
                  autoFocus={!!customDraft.productId}
                />
                <Field
                  label="Price per pack (₹)"
                  placeholder="0"
                  keyboardType="decimal-pad"
                  value={customDraft.price}
                  onChangeText={(t) => setCustomDraft({ ...customDraft, price: t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1") })}
                />
                <View style={styles.sizeRow}>
                  <Text style={[styles.sizeLabel, { flex: 1 }]}>Quantity</Text>
                  <Stepper
                    value={customDraft.quantity}
                    onChange={(q) => setCustomDraft({ ...customDraft, quantity: Math.max(1, q) })}
                  />
                </View>
                <Button
                  label={
                    Number(customDraft.price) > 0
                      ? `Add to order · ${formatINR(Number(customDraft.price) * customDraft.quantity)}`
                      : "Add to order"
                  }
                  icon="add"
                  onPress={addCustom}
                />
              </View>
            ) : found ? (
              <View style={{ gap: 4 }}>
                <View style={styles.foundHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.foundName}>{displayProductName(found.name)}</Text>
                    <Text style={styles.foundCode}>
                      {found.shortCode} · {found.category}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setFound(null)} hitSlop={10} accessibilityLabel="Choose another product">
                    <Ionicons name="close" size={22} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                {found.variants.map((v) => (
                  <View key={v.id} style={styles.sizeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sizeLabel}>{v.sizeLabel === "STD" ? "Standard pack" : v.sizeLabel}</Text>
                      <Text style={v.price > 0 ? styles.sizePrice : styles.noPrice}>
                        {v.price > 0 ? formatINR(v.price) : "Price not set"}
                      </Text>
                    </View>
                    {/* The server refuses unpriced sizes; ask the office rather than send a ₹0 order. */}
                    {v.price > 0 ? (
                      <Stepper value={draftQty[v.id] ?? 0} onChange={(q) => setDraftQty((prev) => ({ ...prev, [v.id]: q }))} />
                    ) : (
                      <Text style={styles.askOffice}>{"Ask office\nto set price"}</Text>
                    )}
                  </View>
                ))}
                <Button
                  label={draftCount ? `Add ${draftCount} ${draftCount === 1 ? "pack" : "packs"} to order` : "Add to order"}
                  icon="add"
                  onPress={addToCart}
                  disabled={!draftCount}
                  style={{ marginTop: 10 }}
                />
                <TouchableOpacity style={styles.customLink} onPress={() => startCustom(found)} accessibilityRole="button">
                  <Ionicons name="create-outline" size={17} color={colors.primary} />
                  <Text style={styles.customLinkText}>Customer wants a different size or pack</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Field
                  icon="search-outline"
                  placeholder="Search product name or code"
                  autoCorrect={false}
                  value={query}
                  onChangeText={setQuery}
                  onFocus={revealProducts}
                  returnKeyType="search"
                  onSubmitEditing={() => matches[0] && pick(matches[0])}
                />
                {catalog === null ? <ActivityIndicator color={colors.textMuted} /> : null}
                {query.trim() && catalog && matches.length === 0 ? (
                  <Text style={styles.noMatch}>No product matches “{query.trim()}”. Check the Price List tab.</Text>
                ) : null}
                {matches.length > 0 ? (
                  <View style={styles.results}>
                    {matches.map((p, i) => {
                      const prices = p.variants.filter((v) => v.price > 0).map((v) => v.price);
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.result, i > 0 && styles.resultDivider]}
                          onPress={() => pick(p)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.resultName} numberOfLines={1}>
                              {displayProductName(p.name)}
                            </Text>
                            <Text style={styles.resultMeta}>
                              {p.shortCode} · {p.variants.map((v) => v.sizeLabel).join(", ")}
                              {prices.length ? `  ·  from ${formatINR(Math.min(...prices))}` : ""}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
                {!query.trim() && cart.length === 0 ? (
                  <Text style={styles.hint}>Type part of a name (e.g. “premium”) or a product code (e.g. RPE).</Text>
                ) : null}
                <TouchableOpacity style={styles.customLink} onPress={() => startCustom()} accessibilityRole="button">
                  <Ionicons name="create-outline" size={17} color={colors.primary} />
                  <Text style={styles.customLinkText}>
                    {query.trim() && catalog && matches.length === 0
                      ? `Add “${query.trim()}” as a custom item`
                      : "Add a custom item not in the price list"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </Card>

          {cart.length > 0 ? (
            <>
              <Step number={3} title="Review" />
              <Card style={styles.summary}>
                {cart.map((l, i) => (
                  <View key={l.key} style={[styles.cartRow, i > 0 && styles.cartDivider]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.cartName} numberOfLines={2}>
                        {displayProductName(l.productName)}
                      </Text>
                      <Text style={styles.cartMeta}>
                        {l.sizeLabel === "STD" ? "Standard pack" : l.sizeLabel} · {formatINR(l.unitPrice)} each
                        {l.custom ? "  ·  custom" : ""}
                      </Text>
                      <Text style={styles.cartLineTotal}>{formatINR(l.unitPrice * l.quantity)}</Text>
                    </View>
                    <Stepper value={l.quantity} onChange={(q) => setLineQty(l.key, q)} removable />
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    Total · {units} {units === 1 ? "pack" : "packs"}
                  </Text>
                  <Text style={styles.totalValue}>{formatINR(total)}</Text>
                </View>
              </Card>
            </>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <View style={{ flex: 1 }}>
            <Text style={styles.footerLabel}>
              {cart.length ? `${cart.length} ${cart.length === 1 ? "item" : "items"} · ${units} packs` : "No items yet"}
            </Text>
            <Text style={styles.footerTotal}>{formatINR(total)}</Text>
          </View>
          <Button
            label="Place order"
            icon="checkmark"
            onPress={handleSubmit}
            loading={submitting}
            disabled={cart.length === 0 || !customerName.trim()}
            style={{ flex: 1.2 }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Step({ number, title }: { number: number; title: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
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
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.max(0, value - 1))} accessibilityLabel="Decrease">
        <Ionicons
          name={removable && value <= 1 ? "trash-outline" : "remove"}
          size={18}
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
        <Ionicons name="add" size={18} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  offDuty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  offDutyTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  offDutyText: { fontSize: 15, color: colors.textMuted, textAlign: "center", marginBottom: 12 },
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  step: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  stepTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  card: { gap: 14, padding: 18 },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  noMatch: { fontSize: 13, color: colors.textMuted },
  results: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  result: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  resultDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  resultName: { fontSize: 15, fontWeight: "600", color: colors.text },
  resultMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  foundHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 6 },
  foundName: { fontSize: 17, fontWeight: "700", color: colors.text },
  foundCode: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sizeLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
  sizePrice: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  noPrice: { fontSize: 12, color: colors.textFaint },
  askOffice: { fontSize: 12, color: colors.textMuted, textAlign: "right", fontWeight: "600" },
  customLink: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  customLinkText: { fontSize: 14, fontWeight: "600", color: colors.primary, flexShrink: 1 },
  fixedLabel: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: 4 },
  fixedValue: { fontSize: 16, fontWeight: "600", color: colors.text },
  segment: { flexDirection: "row", gap: 8 },
  segmentItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  segmentOn: { backgroundColor: colors.text, borderColor: colors.text },
  segmentText: { fontSize: 14, fontWeight: "600", color: colors.text },
  storeChosen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
  },
  farWarning: { fontSize: 13, color: colors.warning, fontWeight: "600", lineHeight: 19 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  stepBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  stepValue: { width: 44, textAlign: "center", fontSize: 16, fontWeight: "700", color: colors.text, paddingVertical: 0 },
  summary: { paddingVertical: 4, paddingHorizontal: 18 },
  cartRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  cartDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  cartName: { fontSize: 15, fontWeight: "600", color: colors.text },
  cartMeta: { fontSize: 12, color: colors.textMuted },
  cartLineTotal: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 2 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
  },
  totalLabel: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  totalValue: { fontSize: 18, fontWeight: "700", color: colors.text },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  footerLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  footerTotal: { fontSize: 22, fontWeight: "700", color: colors.text },
});
