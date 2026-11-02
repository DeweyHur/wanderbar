/**
 * Sends uncaught JS errors (including the ones that crash the app on launch) to the API, where they show
 * up in the server logs as "[client-error]". Imported first by app/_layout.tsx, so it
 * imports nothing from the app.
 */
import { Platform } from "react-native";

type Handler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsT = { getGlobalHandler(): Handler; setGlobalHandler(h: Handler): void };

const API = Platform.OS === "web" ? "" : (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export function reportClientError(error: unknown, fatal: boolean, where = "global") {
  if (Platform.OS !== "web" && !API) return Promise.resolve();
  const e = error instanceof Error ? error : new Error(String(error));
  return fetch(`${API}/api/client-log`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-wanderbar-client": Platform.OS === "web" ? "web" : "app" },
    body: JSON.stringify({
      message: e.message.slice(0, 2000),
      stack: (e.stack ?? "").slice(0, 8000),
      fatal,
      where,
      platform: Platform.OS,
      platformVersion: String(Platform.Version ?? ""),
      build: process.env.EXPO_PUBLIC_BUILD_NUMBER ?? "",
    }),
  }).catch(() => {});
}

const ErrorUtils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsT }).ErrorUtils;
if (ErrorUtils) {
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportClientError(error, !!isFatal);
    // Give the report a moment to leave before the default handler tears the app down.
    if (isFatal) setTimeout(() => previous(error, isFatal), 1500);
    else previous(error, isFatal);
  });
}
