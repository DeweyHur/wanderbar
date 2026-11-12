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

// Expo project for iOS builds (EAS Build → TestFlight); from expo.dev → project → Project ID. Not secret.
const easProjectId = "36e32811-cb27-4d29-855d-1e4d8651f7a4";
const easOwner = "digitz";

// Firebase config for push (group news). Not in git: CI writes it from a secret and points this at it.
const googleServicesFile = process.env.GOOGLE_SERVICES_FILE || undefined;

const config: ExpoConfig = {
  name: "wanderbar",
  slug: "wanderbar",
  ...(easOwner.startsWith("REPLACE") ? {} : { owner: easOwner }),
  scheme: "wanderbar",
  version: "0.3.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    // Different from the legacy Kotlin app (app.wanderbar) so both can be installed during the move.
    bundleIdentifier: "app.wanderbar.mobile",
    buildNumber: String(buildNumber),
    supportsTablet: false,
    // No custom encryption (HTTPS only), so TestFlight doesn't ask about export compliance each build.
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
    // Sign in with Apple (App Store rule 4.8: apps with Google sign-in must offer it too).
    usesAppleSignIn: true,
  },
  android: {
    package: "app.wanderbar.mobile",
    versionCode: buildNumber,
    // The workout rest timer's notification rings on the exact second (the user allows it in "Alarms & reminders").
    permissions: ["android.permission.SCHEDULE_EXACT_ALARM"],
    adaptiveIcon: {
      // Pin-chan on baby pink (assets are drawn by scripts/icon.cjs).
      backgroundColor: "#FBD3E0",
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    googleServicesFile,
  },
  web: {
    // One HTML page; the API's Next.js app serves it for every non-API path (see apps/api/next.config.ts).
    output: "single",
    bundler: "metro",
    favicon: "./assets/favicon.png",
  },
  plugins: [
    // Reminders (scheduled on the phone) and group news (FCM push).
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#D4618B" }],
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 220, resizeMode: "contain", backgroundColor: "#FFF3F6" }],
    // Photos for restaurants, menus and dishes (picked from the library; resized on the device).
    ["expo-image-picker", { photosPermission: "Pick photos of what you ate to add them to your group's log.", cameraPermission: false, microphonePermission: false }],
    "expo-router",
    "expo-apple-authentication",
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
        // Must differ from the app target ("wanderbar"): EAS matches signing profiles to targets by name.
        iosShareExtensionName: "Wanderbar Share",
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
  extra: {
    ...(easProjectId.startsWith("REPLACE") ? {} : { eas: { projectId: easProjectId } }),
    // Which commit this build is (shown in Settings, so you can tell an update arrived).
    commit: (process.env.EAS_BUILD_GIT_COMMIT_HASH || process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7),
  },
};

export default config;
