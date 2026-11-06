import { Platform } from "react-native";
import { sessionStore } from "./platform/session";

// The web app is served from the API's own origin, so it calls relative URLs with its cookie.
const API_URL = Platform.OS === "web" ? "" : (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export type User = { id: string; email: string; name: string | null; image: string | null; locale: string | null };
export type Role = "owner" | "host" | "member";
export type GroupModuleId = "food" | "boardgame";
export type GroupSummary = { id: string; name: string; module: GroupModuleId; role: Role };
export type Member = { id: string; name: string | null; email: string; image: string | null; role: Role };
export type GroupDetail = {
  id: string;
  name: string;
  module: GroupModuleId;
  defaultLocale: string;
  timezone: string;
  currency: string;
  myRole: Role;
  members: Member[];
};
export type Me = { user: User; groups: GroupSummary[] };

/** `code` is a stable error code from the server (or "network"), translated as "errors.<code>". */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

let token: string | null = null;

export async function loadToken() {
  token = await sessionStore.load();
  return token;
}

export async function saveToken(next: string | null) {
  token = next;
  await sessionStore.save(next);
}

/** Whether it's worth asking the server who we are (web: the cookie may exist; apps: need a token). */
export const mightHaveSession = () => sessionStore.mode === "cookie" || token !== null;

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (Platform.OS !== "web" && !API_URL) throw new ApiError(0, "config.api_url_missing");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionStore.mode === "cookie") headers["x-wanderbar-client"] = "web";
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers,
      credentials: "same-origin",
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "unknown");
  return data as T;
}

/** An image our API serves (e.g. a restaurant's cover photo), with the app's sign-in header. */
export function apiImage(path: string) {
  return { uri: API_URL + path, headers: token ? { authorization: `Bearer ${token}` } : undefined };
}

/** multipart/form-data POST (photo uploads); same sign-in and error handling as api(). */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  if (Platform.OS !== "web" && !API_URL) throw new ApiError(0, "config.api_url_missing");
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (sessionStore.mode === "cookie") headers["x-wanderbar-client"] = "web";
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method: "POST", headers, credentials: "same-origin", body: form });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "unknown");
  return data as T;
}
