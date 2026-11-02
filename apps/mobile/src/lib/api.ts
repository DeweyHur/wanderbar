import * as SecureStore from "expo-secure-store";

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "session_token";

export type User = { id: string; email: string; name: string | null; image: string | null };
export type Role = "owner" | "member";
export type GroupSummary = { id: string; name: string; role: Role };
export type Member = { id: string; name: string | null; email: string; image: string | null; role: Role };
export type GroupDetail = { id: string; name: string; myRole: Role; members: Member[] };
export type Me = { user: User; groups: GroupSummary[] };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;

export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function saveToken(next: string | null) {
  token = next;
  if (next) await SecureStore.setItemAsync(TOKEN_KEY, next);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!API_URL) throw new ApiError(0, "EXPO_PUBLIC_API_URL이 설정되지 않았어요");
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "서버에 연결할 수 없어요");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `오류 (${res.status})`);
  return data as T;
}
