import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioSource,
} from "expo-audio";
import { getAccessToken, getApiUrl } from "../lib/api";
import { colors, formatClock, radius } from "../theme";

export interface RecordedNote {
  uri: string;
  durationMs: number;
}

// AAC in .m4a (plays in every browser for the office), mono at 64 kbps: clear
// for speech at ~0.5 MB a minute, so it uploads quickly on mobile data.
const VOICE_PRESET = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 };
export const VOICE_NOTE_MIME = "audio/mp4";

// Long enough for a shop's whole special order, well inside the server's 8 MB.
const MAX_RECORDING_MS = 5 * 60 * 1000;

// Record the customer's order in their own words (any language), listen back,
// and redo or remove it before the order is placed.
export function VoiceRecorder({ value, onChange }: { value: RecordedNote | null; onChange: (note: RecordedNote | null) => void }) {
  const recorder = useAudioRecorder(VOICE_PRESET);
  const state = useAudioRecorderState(recorder);
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    try {
      const { granted, canAskAgain } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Microphone needed",
          "Allow the microphone to record the customer's order.",
          canAskAgain ? undefined : [{ text: "Cancel" }, { text: "Open settings", onPress: () => Linking.openSettings() }]
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      Alert.alert("Couldn't start recording", "Please try again.");
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    const durationMs = state.durationMillis;
    await recorder.stop();
    // Back to playback mode, so the note plays through the speaker, not the earpiece.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (recorder.uri && durationMs >= 1000) onChange({ uri: recorder.uri, durationMs });
    else Alert.alert("Too short", "Hold on a moment longer while the customer speaks.");
  }

  // Stop on the time limit instead of growing past what the server accepts.
  useEffect(() => {
    if (state.isRecording && state.durationMillis >= MAX_RECORDING_MS) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isRecording, state.durationMillis]);

  if (state.isRecording) {
    return (
      <View style={styles.row}>
        <View style={styles.recDot} />
        <Text style={styles.recText}>Recording  {formatClock(state.durationMillis)}</Text>
        <TouchableOpacity style={styles.stopButton} onPress={stop} accessibilityLabel="Stop recording">
          <Ionicons name="stop" size={16} color="#fff" />
          <Text style={styles.stopText}>Stop</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (value) {
    return (
      <View style={styles.row}>
        <VoicePlayer source={{ uri: value.uri }} durationMs={value.durationMs} />
        <TouchableOpacity
          hitSlop={10}
          accessibilityLabel="Delete voice note"
          onPress={() =>
            Alert.alert("Delete voice note?", "You can record a new one.", [
              { text: "Keep" },
              { text: "Delete", style: "destructive", onPress: () => onChange(null) },
            ])
          }
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.recordButton} onPress={start} disabled={starting} accessibilityRole="button">
      {starting ? <ActivityIndicator color={colors.text} /> : <Ionicons name="mic-outline" size={20} color={colors.text} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.recordLabel}>Record voice note</Text>
        <Text style={styles.recordHint}>The customer's special request, in their words</Text>
      </View>
    </TouchableOpacity>
  );
}

// Play/pause with elapsed and total time, for a recorded file or an order's
// note on the server (pass the auth header in `source`).
export function VoicePlayer({ source, durationMs }: { source: AudioSource; durationMs?: number | null }) {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const totalMs = status.duration > 0 ? status.duration * 1000 : durationMs ?? 0;

  function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    // Start again from the top once it has played to the end.
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) player.seekTo(0);
    player.play();
  }

  return (
    <View style={styles.player}>
      <TouchableOpacity style={styles.playButton} onPress={toggle} accessibilityLabel={status.playing ? "Pause" : "Play voice note"}>
        {status.isBuffering && !status.isLoaded ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name={status.playing ? "pause" : "play"} size={18} color="#fff" />
        )}
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 6 }}>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${totalMs ? Math.min(100, (status.currentTime * 100000) / totalMs) : 0}%` }]} />
        </View>
        <Text style={styles.time}>
          Voice note · {status.currentTime > 0 ? `${formatClock(status.currentTime * 1000)} / ` : ""}
          {formatClock(totalMs)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  recordButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderStyle: "dashed",
    borderRadius: radius.md,
  },
  recordLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
  recordHint: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  recText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.danger,
  },
  stopText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  player: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" },
  trackFill: { height: 4, backgroundColor: colors.text },
  time: { fontSize: 12, color: colors.textMuted, fontVariant: ["tabular-nums"] },
});

// An order's voice note from the server, fetched with the salesperson's login.
export function OrderVoiceNote({ orderId, durationMs }: { orderId: string; durationMs?: number | null }) {
  const [source, setSource] = useState<AudioSource | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([getApiUrl(), getAccessToken()]).then(([url, token]) => {
      if (live) {
        setSource({ uri: `${url}/api/orders/${orderId}/voice-note`, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      }
    });
    return () => {
      live = false;
    };
  }, [orderId]);
  return source ? <VoicePlayer source={source} durationMs={durationMs} /> : null;
}
