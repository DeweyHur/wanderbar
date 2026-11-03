import * as IntentLauncher from "expo-intent-launcher";
import { Platform, Share } from "react-native";

const KAKAO_PACKAGE = "com.kakao.talk";

/**
 * Shares text straight to KakaoTalk's chat picker on Android (same way as Tesla), or the share sheet
 * when KakaoTalk isn't installed. iOS can't target an app, so it opens the share sheet (pick KakaoTalk).
 */
export async function shareToKakao(text: string): Promise<"sent" | "fallback"> {
  if (Platform.OS === "android") {
    try {
      await IntentLauncher.startActivityAsync("android.intent.action.SEND", {
        packageName: KAKAO_PACKAGE,
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
