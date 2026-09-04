import React from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useDuty } from "../context/DutyContext";

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const { onDuty, busy, toggleDuty } = useDuty();

  return (
    <View style={styles.container}>
      <View>
        <Text style={styles.greeting}>Hi, {user?.name}</Text>
        <Text style={styles.district}>{user?.district?.name ?? "No district assigned"}</Text>
      </View>

      <View style={[styles.dutyCard, onDuty ? styles.dutyCardOn : styles.dutyCardOff]}>
        <View style={styles.dutyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dutyLabel}>{onDuty ? "You're on duty" : "You're off duty"}</Text>
            <Text style={styles.dutyHint}>
              {onDuty
                ? "Your location is being shared with the admin team."
                : "Go on duty to start sharing your live location."}
            </Text>
          </View>
          {busy ? (
            <ActivityIndicator />
          ) : (
            <Switch value={onDuty} onValueChange={toggleDuty} disabled={busy} />
          )}
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20, gap: 20 },
  greeting: { fontSize: 22, fontWeight: "700" },
  district: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  dutyCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  dutyCardOn: { backgroundColor: "#ecfdf5", borderColor: "#10b981" },
  dutyCardOff: { backgroundColor: "#f9fafb", borderColor: "#e5e7eb" },
  dutyRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dutyLabel: { fontSize: 16, fontWeight: "600" },
  dutyHint: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  logoutButton: { marginTop: "auto", alignItems: "center", paddingVertical: 12 },
  logoutText: { color: "#dc2626", fontWeight: "600" },
});
