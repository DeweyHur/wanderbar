import * as IntentLauncher from "expo-intent-launcher";
import { Platform, Share } from "react-native";

const TESLA_PACKAGE = "com.teslamotors.tesla";

/**
 * Hands the destination text to the Tesla app. Android targets the Tesla app directly (like the old
 * Kotlin app) and falls back to the share sheet; iOS always shows the share sheet (pick Tesla there).
 * Returns "fallback" when the Tesla app couldn't be opened directly on Android.
 */
export async function sendToTesla(text: string): Promise<"sent" | "fallback"> {
  if (Platform.OS === "android") {
    try {
      await IntentLauncher.startActivityAsync("android.intent.action.SEND", {
        packageName: TESLA_PACKAGE,
        type: "text/plain",
        extra: { "android.intent.extra.TEXT": text },
      });
      return "sent";
    } catch {
      await Share.share({ message: text });
      return "fallback";
    }
  }
  await Share.share({ message: text });
  return "sent";
}

/** Phones can send to Tesla; the web can't (it offers copy-address and directions instead). */
export const canSendToTesla = true;
export const devicePlatform: "android" | "ios" | null = Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : null;
