import type { ExpoConfig } from "expo/config";

// Reversed iOS OAuth client ID, e.g. com.googleusercontent.apps.1234-abcd (Google Cloud → Credentials → iOS client).
const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ?? "com.googleusercontent.apps.REPLACE_ME";

// CI sets GITHUB_RUN_NUMBER so every APK installs as an update over the previous one.
const buildNumber = Number(process.env.GITHUB_RUN_NUMBER ?? 1);

const config: ExpoConfig = {
  name: "wanderbar",
  slug: "wanderbar",
  scheme: "wanderbar",
  version: "0.3.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    // Different from the legacy Kotlin app (app.wanderbar) so both can be installed during the move.
    bundleIdentifier: "app.wanderbar.mobile",
    buildNumber: String(buildNumber),
    supportsTablet: false,
  },
  android: {
    package: "app.wanderbar.mobile",
    versionCode: buildNumber,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: ["expo-router", ["@react-native-google-signin/google-signin", { iosUrlScheme }]],
  experiments: { typedRoutes: true },
};

export default config;
