import React, { useCallback, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useDuty } from "../context/DutyContext";
import { api } from "../lib/api";
import { Card, SectionLabel } from "../components/ui";
import { ServerSetting } from "./LoginScreen";
import { colors, formatTime, radius } from "../theme";

interface DutyStatus {
  onDuty: boolean;
  since: string | null;
  minutesToday: number;
}

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function hoursAndMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { onDuty, busy, toggleDuty } = useDuty();
  const [status, setStatus] = useState<DutyStatus | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Android can open this screen part-way down (the slide-in animation lays it
  // out under the header first), so always start at the top.
  const toTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), []);

  const load = useCallback(() => {
    api<DutyStatus>("/api/tracking/me")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      toTop();
    }, [load, onDuty, toTop])
  );

  const initials = (user?.name ?? "?")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Ending duty stops the working-hours clock, so it is confirmed first.
  function confirmEndDuty() {
    Alert.alert(
      "End duty for today?",
      "Your working hours stop counting from now and the office will see you as off duty.",
      [
        { text: "Keep working", style: "cancel" },
        { text: "End duty", style: "destructive", onPress: toggleDuty },
      ]
    );
  }

  function confirmLogout() {
    if (onDuty) {
      // Logging out would stop tracking without ending the shift properly.
      Alert.alert("You're on duty", "End duty before logging out.");
      return;
    }
    Alert.alert("Log out?", "You'll need your mobile number and password to log in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: logout },
    ]);
  }

  const version: string = require("../../app.json").expo.version;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        contentOffset={{ x: 0, y: 0 }}
        onLayout={toTop}
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.role}>Sales Executive · {user?.district?.name ?? "No district"}</Text>
        </View>

        <SectionLabel>Today</SectionLabel>
        <Card style={styles.group}>
          <Row
            icon="radio-button-on-outline"
            label="Duty status"
            value={
              onDuty
                ? status?.since
                  ? `On duty since ${formatTime(status.since)}`
                  : "On duty"
                : "Off duty"
            }
            valueColor={onDuty ? colors.success : colors.textMuted}
          />
          <Divider />
          <Row icon="time-outline" label="Hours worked today" value={status ? hoursAndMinutes(status.minutesToday) : "–"} />
        </Card>

        <SectionLabel>Details</SectionLabel>
        <Card style={styles.group}>
          <Row icon="id-card-outline" label="Employee code" value={user?.employeeCode ?? "–"} />
          <Divider />
          <Row icon="call-outline" label="Mobile number" value={user?.phone ? `+91 ${user.phone}` : "–"} />
          <Divider />
          <Row icon="location-outline" label="District" value={user?.district?.name ?? "–"} />
          <Divider />
          <Row icon="information-circle-outline" label="App version" value={version} />
        </Card>

        <SectionLabel>Account</SectionLabel>
        <Card style={styles.group}>
          {onDuty ? (
            <>
              <Row icon="stop-circle-outline" label="End duty" onPress={confirmEndDuty} disabled={busy} destructive />
              <Divider />
            </>
          ) : null}
          <Row icon="log-out-outline" label="Log out" onPress={confirmLogout} />
        </Card>

        <ServerSetting />

        <Text style={styles.footnote}>
          Duty start and end times are recorded and visible to the office.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
  valueColor,
  onPress,
  destructive = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  value?: string;
  valueColor?: string;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const tint = destructive ? colors.danger : colors.text;
  const body = (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.textMuted} />
      <Text style={[styles.rowLabel, { color: tint }]}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
    </View>
  );
  return onPress ? (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress} disabled={disabled}>
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  identity: { alignItems: "center", paddingVertical: 16, gap: 4 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  avatarText: { fontSize: 26, fontWeight: "700", color: colors.text, letterSpacing: 1 },
  name: { fontSize: 22, fontWeight: "700", color: colors.text },
  role: { fontSize: 14, color: colors.textMuted },
  group: { padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, paddingHorizontal: 16 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  rowValue: { fontSize: 15, color: colors.textMuted, fontWeight: "500", maxWidth: "55%", textAlign: "right" },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 48 },
  footnote: { fontSize: 12, color: colors.textFaint, textAlign: "center", marginTop: 4, paddingHorizontal: 16 },
});
