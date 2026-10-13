import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { useAuth } from "../context/AuthContext";
import { colors, radius } from "../theme";

const PHONE_LENGTH = 10;

// Keeps a mobile number to 10 digits. A pasted "+91 98765 43210" or "098765 43210"
// loses its country/trunk prefix; any other extra digit typed past 10 is ignored.
function toMobileDigits(text: string) {
  let digits = text.replace(/\D/g, "");
  if ((digits.length === 12 && digits.startsWith("91")) || (digits.length === 11 && digits.startsWith("0"))) {
    digits = digits.slice(-PHONE_LENGTH);
  }
  return digits.slice(0, PHONE_LENGTH);
}

export default function LoginScreen() {
  const { login } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<"phone" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneComplete = phone.length === PHONE_LENGTH;
  const canSubmit = phoneComplete && password.length > 0 && !submitting;

  function handlePhoneChange(text: string) {
    setPhone(toMobileDigits(text));
    if (error) setError(null);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(phone, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Image source={require("../../assets/roalux-logo.png")} style={styles.logo} resizeMode="contain" />
            <Text style={styles.brandTag}>Sales app</Text>
          </View>

          <View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Log in with your registered mobile number.</Text>
          </View>

          <View style={styles.form}>
            <View style={{ gap: 8 }}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Mobile number</Text>
                <Text style={[styles.counter, phoneComplete && { color: colors.success }]}>
                  {phone.length}/{PHONE_LENGTH}
                </Text>
              </View>
              <View style={[styles.inputRow, focused === "phone" && styles.inputFocused]}>
                <View style={styles.prefix}>
                  <Text style={styles.prefixText}>+91</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  value={phone}
                  onChangeText={handlePhoneChange}
                  placeholder="98765 43210"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="next"
                  onFocus={() => setFocused("phone")}
                  onBlur={() => setFocused(null)}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
                {phoneComplete ? <Ionicons name="checkmark-circle" size={22} color={colors.success} /> : null}
              </View>
              {phone.length > 0 && !phoneComplete && focused !== "phone" ? (
                <Text style={styles.hint}>Enter all 10 digits of your mobile number.</Text>
              ) : null}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputRow, focused === "password" && styles.inputFocused]}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textFaint} style={{ marginLeft: 14 }} />
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (error) setError(null);
                  }}
                  placeholder="Your password"
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  returnKeyType="go"
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  onSubmitEditing={handleSubmit}
                />
                <TouchableOpacity
                  style={styles.eye}
                  onPress={() => setShowPassword((s) => !s)}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {error ? (
              <View style={styles.error}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.submit, !canSubmit && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.submitText}>Log in</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.help}>
            <Ionicons name="help-circle-outline" size={16} color={colors.textFaint} />
            <Text style={styles.helpText}>Forgot your password? Ask your manager to reset it.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 32, gap: 28 },
  brand: { alignItems: "center", gap: 6 },
  logo: { width: 210, height: 73 },
  brandTag: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textFaint,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
  form: { gap: 18 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { fontSize: 14, fontWeight: "700", color: colors.text },
  counter: { fontSize: 13, fontWeight: "700", color: colors.textFaint, fontVariant: ["tabular-nums"] },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingRight: 12,
    overflow: "hidden",
  },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  prefix: {
    alignSelf: "stretch",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    marginRight: 2,
  },
  prefixText: { fontSize: 17, fontWeight: "700", color: colors.text },
  input: { flex: 1, fontSize: 17, color: colors.text, paddingHorizontal: 12, paddingVertical: 14 },
  phoneInput: { letterSpacing: 1.5, fontWeight: "600" },
  hint: { fontSize: 13, color: colors.warning, fontWeight: "500" },
  eye: { padding: 6 },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: 12,
  },
  errorText: { color: colors.danger, flex: 1, fontSize: 14, fontWeight: "500" },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  submitDisabled: { backgroundColor: colors.textFaint },
  submitText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  help: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  helpText: { color: colors.textFaint, fontSize: 13 },
});
