import Constants from "expo-constants";
import { Platform } from "react-native";
import { API_URL } from "@/core/api";

/** Sends a caught crash to the server log (message and stack only). Never throws. */
export function reportCrash(error: unknown, where: string) {
  const e = error instanceof Error ? error : new Error(String(error));
  fetch(`${API_URL}/api/client-errors`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-wanderbar-client": Platform.OS === "web" ? "web" : "app" },
    body: JSON.stringify({
      message: e.message.slice(0, 2000),
      stack: (e.stack ?? "").slice(0, 8000),
      where: where.slice(0, 200),
      platform: Platform.OS,
      version: `${Constants.expoConfig?.version ?? "?"}+${Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber ?? "?"}`,
    }),
  }).catch(() => {});
}

/** Errors outside rendering (event handlers, promises) would otherwise close the app without a trace. */
export function installCrashHandler() {
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } };
  if (!g.ErrorUtils) return;
  const previous = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((e, fatal) => {
    reportCrash(e, fatal ? "global (fatal)" : "global");
    // Give the report a moment before the default handler closes the app.
    if (fatal) setTimeout(() => previous(e, fatal), 800);
    else previous(e, fatal);
  });
}
