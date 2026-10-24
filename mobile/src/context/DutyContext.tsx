import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert, AppState, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from "react-native";
import { api } from "../lib/api";
import {
  getCurrentPosition,
  isBackgroundLocationRunning,
  requestLocationPermissions,
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
} from "../lib/locationTask";
import { Button, Card, Field } from "../components/ui";
import { colors } from "../theme";

interface DutyContextValue {
  onDuty: boolean;
  busy: boolean;
  // Asks for the employee code, then starts or ends duty.
  toggleDuty: () => void;
}

const DutyContext = createContext<DutyContextValue | undefined>(undefined);

export function DutyProvider({ children }: { children: React.ReactNode }) {
  const [onDuty, setOnDuty] = useState(false);
  const [busy, setBusy] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Re-read on every return to the foreground: tracking can be stopped behind
  // the app's back (the server switched us off duty after a long silence).
  useEffect(() => {
    const sync = () =>
      isBackgroundLocationRunning().then((running) => {
        setOnDuty(running);
        setBusy(false);
      });
    sync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => sub.remove();
  }, []);

  const toggleDuty = useCallback(() => {
    setCode("");
    setError(null);
    setConfirming(true);
  }, []);

  // Going on or off duty is confirmed with the employee code, checked by the
  // server, so it can't happen by a stray tap and is plainly the employee's act.
  async function confirm() {
    if (!code.trim()) {
      setError("Enter your employee code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!onDuty) {
        const perms = await requestLocationPermissions();
        if (!perms.granted) {
          setConfirming(false);
          Alert.alert("Location permission needed", "Roalux Sales needs location access to go on duty.");
          return;
        }
        const pos = await getCurrentPosition();
        await api("/api/tracking/duty", {
          method: "POST",
          body: JSON.stringify({ onDuty: true, employeeCode: code, lat: pos?.lat, lng: pos?.lng }),
        });
        await startBackgroundLocationUpdates();
        setOnDuty(true);
        setConfirming(false);
        if (!perms.backgroundGranted) {
          Alert.alert(
            "Background location recommended",
            "Without \"Allow all the time\", your position stops updating for the admin when the app is in the background."
          );
        }
      } else {
        // The server checks the code first; tracking only stops once it agrees.
        await api("/api/tracking/duty", { method: "POST", body: JSON.stringify({ onDuty: false, employeeCode: code }) });
        await stopBackgroundLocationUpdates();
        setOnDuty(false);
        setConfirming(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const value = useMemo(() => ({ onDuty, busy, toggleDuty }), [onDuty, busy, toggleDuty]);

  return (
    <DutyContext.Provider value={value}>
      {children}
      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Card style={styles.sheet}>
            <Text style={styles.title}>{onDuty ? "End duty for today?" : "Start duty"}</Text>
            <Text style={styles.text}>
              {onDuty
                ? "Your working hours stop counting and the office sees you as off duty. Type your employee code to confirm."
                : "Your hours start counting and the office can see your position. Type your employee code to confirm."}
            </Text>
            <Field
              label="Employee code"
              placeholder="e.g. RLX-CHN-001"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              value={code}
              onChangeText={(t) => {
                setCode(t);
                setError(null);
              }}
              onSubmitEditing={confirm}
              returnKeyType="done"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.buttons}>
              <Button label="Cancel" variant="secondary" onPress={() => setConfirming(false)} style={{ flex: 1 }} />
              <Button
                label={onDuty ? "End duty" : "Start duty"}
                variant={onDuty ? "danger" : "primary"}
                onPress={confirm}
                loading={busy}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </KeyboardAvoidingView>
      </Modal>
    </DutyContext.Provider>
  );
}

export function useDuty(): DutyContextValue {
  const ctx = useContext(DutyContext);
  if (!ctx) throw new Error("useDuty must be used within DutyProvider");
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  sheet: { gap: 14, padding: 22 },
  title: { fontSize: 19, fontWeight: "700", color: colors.text },
  text: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  error: { fontSize: 13, color: colors.danger, fontWeight: "600" },
  buttons: { flexDirection: "row", gap: 12, marginTop: 4 },
});
