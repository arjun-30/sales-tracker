import React, { useEffect, useMemo, useRef, useState } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { distanceKm, formatKm, type LatLng } from "../lib/geo";
import type { Store } from "../lib/types";
import { colors, radius } from "../theme";

// Tamil Nadu, for when there are no stores or position to frame yet.
const TN_REGION = { latitude: 11.0, longitude: 78.4, latitudeDelta: 6.5, longitudeDelta: 6.5 };

// The plant's shops on a map with the salesperson's own position. Tapping a pin
// shows the shop with directions and a call button; until then the nearest is
// suggested.
export function StoreMap({ stores, me }: { stores: Store[]; me: LatLng | null }) {
  const mapRef = useRef<MapView>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Custom pins are views snapshotted into bitmaps; redraw them only briefly
  // after a change (icon font loaded, selection moved), then freeze them so a
  // map full of shops stays smooth.
  const [drawingPins, setDrawingPins] = useState(true);
  useEffect(() => {
    setDrawingPins(true);
    const t = setTimeout(() => setDrawingPins(false), 600);
    return () => clearTimeout(t);
  }, [selectedId, stores]);

  const nearest = useMemo(() => {
    if (!me || stores.length === 0) return null;
    return stores.reduce((best, s) => (distanceKm(me, s) < distanceKm(me, best) ? s : best));
  }, [stores, me]);
  const selected = stores.find((s) => s.id === selectedId) ?? null;
  const shown = selected ?? nearest;

  // Frame every shop and the salesperson once the map has its size.
  function frame() {
    const points = [...stores.map((s) => ({ latitude: s.lat, longitude: s.lng }))];
    if (me) points.push({ latitude: me.lat, longitude: me.lng });
    if (points.length === 1) {
      mapRef.current?.animateToRegion({ ...points[0], latitudeDelta: 0.05, longitudeDelta: 0.05 }, 0);
    } else if (points.length > 1) {
      mapRef.current?.fitToCoordinates(points, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: false,
      });
    }
  }

  function directions(s: Store) {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`);
  }

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={TN_REGION}
        onMapReady={frame}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onPress={() => setSelectedId(null)}
      >
        {stores.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={s.name}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={drawingPins}
            onPress={(e) => {
              e.stopPropagation();
              setSelectedId(s.id);
            }}
          >
            <StorePin selected={s.id === shown?.id} pending={s.status === "pending"} />
          </Marker>
        ))}
      </MapView>

      {shown ? (
        <View style={styles.panel}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.kicker}>
              {selected ? "Selected shop" : "Nearest shop"}
              {shown.status === "pending" ? "  ·  waiting for office approval" : ""}
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {shown.name}
            </Text>
            <Text style={styles.meta} numberOfLines={2}>
              {[me ? `${formatKm(distanceKm(me, shown))} away` : null, shown.ownerName, shown.address].filter(Boolean).join("  ·  ")}
            </Text>
          </View>
          {shown.phone ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => Linking.openURL(`tel:${shown.phone}`)}
              accessibilityLabel={`Call ${shown.name}`}
            >
              <Ionicons name="call-outline" size={19} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.iconButton, styles.directions]}
            onPress={() => directions(shown)}
            accessibilityLabel={`Directions to ${shown.name}`}
          >
            <Ionicons name="navigate-outline" size={19} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.empty}>
          {stores.length === 0 ? "No shops added for your plant yet. The office adds them." : "Tap a pin to see the shop."}
        </Text>
      )}
    </View>
  );
}

// Shop pin: an amber marker with a shop front, so shops never look like the
// default red location pin. Orange while it waits for office approval; the
// app's blue when it is the shop shown below the map.
const STORE_COLOR = "#d97706";
const PENDING_COLOR = "#ea580c";

function StorePin({ selected, pending }: { selected: boolean; pending: boolean }) {
  const color = selected ? colors.primary : pending ? PENDING_COLOR : STORE_COLOR;
  return (
    <View style={styles.pinWrap}>
      <View style={[styles.pinHead, { backgroundColor: color }, selected && styles.pinHeadSelected]}>
        <Ionicons name={pending ? "time-outline" : "storefront"} size={selected ? 17 : 15} color="#fff" />
      </View>
      <View style={[styles.pinTail, { borderTopColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pinWrap: { alignItems: "center" },
  pinHead: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinHeadSelected: { width: 36, height: 36, borderRadius: 18 },
  pinTail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  wrap: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { height: 240 },
  panel: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  kicker: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase" },
  name: { fontSize: 16, fontWeight: "700", color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  directions: { backgroundColor: colors.text, borderColor: colors.text },
  empty: { padding: 14, fontSize: 13, color: colors.textMuted },
});
