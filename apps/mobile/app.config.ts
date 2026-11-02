import type { ExpoConfig } from "expo/config";

// Reversed iOS OAuth client ID, e.g. com.googleusercontent.apps.1234-abcd (Google Cloud → Credentials → iOS client).
const iosUrlScheme =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ??
  "com.googleusercontent.apps.REPLACE_ME";

// CI sets GITHUB_RUN_NUMBER so every APK installs as an update over the previous one.
// Google key for map tiles only (Maps SDK for Android). It ships inside the app, so restrict it to that API
// and to the app's package + signing SHA-1. Place search and drive times use the server's own key instead.
const androidMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? "";

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
  web: {
    // One HTML page; the API's Next.js app serves it for every non-API path (see apps/api/next.config.ts).
    output: "single",
    bundler: "metro",
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-localization",
    [
      "expo-share-intent",
      {
        // Links and text only (Yelp and Google Maps share a URL, often with a line of text).
        iosActivationRules: {
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsWebPageWithMaxCount: 1,
          NSExtensionActivationSupportsText: true,
        },
        androidIntentFilters: ["text/*"],
        iosShareExtensionName: "wanderbar",
      },
    ],
    ["@react-native-google-signin/google-signin", { iosUrlScheme }],
    // R8 in release builds strips classes that are created by name at startup (WorkManager's Room database,
    // pulled in by react-native-maps), which crashed the app on launch. This is a small private app, so
    // release builds are not minified. The emulator smoke test in CI guards against this coming back.
    ["expo-build-properties", { android: { enableMinifyInReleaseBuilds: false, enableShrinkResourcesInReleaseBuilds: false } }],
    // iOS uses Apple Maps (no key); Android uses Google Maps.
    ["react-native-maps", { androidGoogleMapsApiKey: androidMapsKey }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
