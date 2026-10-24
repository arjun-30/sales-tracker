import type { ConfigContext, ExpoConfig } from "expo/config";

// Plain-HTTP (cleartext) traffic is only for testing against a PC on the same
// Wi-Fi. Production builds talk HTTPS only, so it is off unless a build asks
// for it with ALLOW_CLEARTEXT_HTTP=1 (see eas.json "preview" and DEPLOY.md).
const allowCleartext = process.env.ALLOW_CLEARTEXT_HTTP === "1";

// The Home screen's store map on Android needs a Google key with "Maps SDK
// for Android" enabled, kept out of git in .env.
const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []).map((plugin) => {
      if (Array.isArray(plugin) && plugin[0] === "expo-build-properties") {
        const [name, options = {}] = plugin as [string, { android?: Record<string, unknown> }];
        return [name, { ...options, android: { ...options.android, usesCleartextTraffic: allowCleartext } }];
      }
      return plugin;
    }),
    ["react-native-maps", { androidGoogleMapsApiKey: androidMapsKey }],
  ] as ExpoConfig["plugins"],
});
