import { importPKCS8, SignJWT } from "jose";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import { groups, memberships, pushTokens, users } from "../db/schema";

/**
 * Group news as push notifications (FCM HTTP v1). Sending needs a service account allowed to send
 * Firebase messages, in FCM_SERVICE_ACCOUNT (its JSON, or that JSON in base64). Without it nothing is
 * sent. Messages go to every member's devices except whoever caused them, in each device's language.
 */

type ItemKind = "restaurant" | "menu" | "dish" | "game";

export type PushEvent =
  | { type: "restaurant"; who: string; name: string; itemId: string }
  | { type: "dish"; who: string; name: string; itemId: string }
  | { type: "menu"; who: string; name: string; restaurant: string; itemId: string }
  | { type: "game"; who: string; name: string; itemId: string }
  | { type: "edit"; who: string; name: string; itemId: string; kind: ItemKind }
  | { type: "visit"; who: string; name: string; itemId: string; kind: "restaurant" | "dish" }
  | { type: "rating"; who: string; name: string; stars: number; review?: string; again?: boolean; itemId: string; kind: "menu" | "dish" }
  | { type: "game_rating"; who: string; name: string; score: number; review?: string; again?: boolean; itemId: string }
  | { type: "photo"; who: string; name: string; itemId: string; kind: "restaurant" | "menu" | "dish" }
  | { type: "night_edit"; who: string; at: Date; tz: string; nightId: string }
  | { type: "rsvp"; who: string; status: "going" | "maybe" | "no"; at: Date; tz: string; nightId: string }
  | { type: "night_new"; at: Date; tz: string; nightId: string }
  | { type: "night_game"; who: string; game: string; at: Date; tz: string; nightId: string }
  | { type: "night_tomorrow"; at: Date; tz: string; where: string; games: string[]; nightId: string }
  | { type: "chat"; who: string; text: string; groupId: string }
  | { type: "workout"; who: string; day: string; minutes: number; groupId: string };

/** "Fri, Nov 14, 7:00 PM" / "11월 14일 (금) 오후 7:00" in the group's time zone. */
export function nightWhen(locale: string, at: Date, tz: string) {
  const opts: Intl.DateTimeFormatOptions = { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  try {
    return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", opts).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { ...opts, timeZone: "UTC" }).format(at);
  }
}

/** Saving the same thing again within this window doesn't notify again (edits come in bursts). */
export const QUIET_MS = 10 * 60_000;
export const recently = (at: Date | null | undefined, now = Date.now()) => !!at && now - at.getTime() < QUIET_MS;

/** A new rating is news; changing it is too, unless it's the same or a quick re-edit. */
export const ratingNews = (before: { score: number; review: string; updatedAt: Date } | undefined, score: number, review: string) =>
  !before || ((before.score !== score || before.review !== review) && !recently(before.updatedAt));

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const quote = (review?: string) => (review?.trim() ? ` · “${clip(review.trim().replace(/\s+/g, " "), 80)}”` : "");

/** A member's display name. */
export async function displayName(db: Db, userId: string) {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
  return u ? u.name || u.email.split("@")[0] : "";
}

type Locale = "en" | "ko";

/** Title is the group's name; the body says what happened. */
export function pushText(locale: string, e: PushEvent): string {
  const ko = locale === "ko";
  const star = (n: number) => `${n % 1 ? n.toFixed(1) : n}`;
  switch (e.type) {
    case "restaurant":
      return ko ? `🍜 ${e.who}님이 ${e.name}을(를) 저장했어요` : `🍜 ${e.who} saved ${e.name}`;
    case "dish":
      return ko ? `🍳 ${e.who}님이 집밥 ${e.name}을(를) 올렸어요` : `🍳 ${e.who} added ${e.name} to home cooking`;
    case "menu":
      return ko ? `🍜 ${e.who}님이 ${e.restaurant}에 메뉴 ${e.name}을(를) 추가했어요` : `🍜 ${e.who} added ${e.name} to ${e.restaurant}`;
    case "game":
      return ko ? `🎲 ${e.who}님이 게임 ${e.name}을(를) 추가했어요` : `🎲 ${e.who} added the game ${e.name}`;
    case "edit":
      return ko ? `✏️ ${e.who}님이 ${e.name} 정보를 고쳤어요` : `✏️ ${e.who} updated ${e.name}`;
    case "visit":
      return e.kind === "dish"
        ? ko
          ? `🍳 ${e.who}님이 ${e.name}을(를) 만들었어요`
          : `🍳 ${e.who} made ${e.name}`
        : ko
          ? `📍 ${e.who}님이 ${e.name}에 다녀왔어요`
          : `📍 ${e.who} went to ${e.name}`;
    case "rating":
      return (
        (e.again
          ? ko
            ? `⭐ ${e.who}님이 ${e.name} 평점을 별 ${star(e.stars)}개로 바꿨어요`
            : `⭐ ${e.who} changed their rating of ${e.name} to ${star(e.stars)} stars`
          : ko
            ? `⭐ ${e.who}님이 ${e.name}에 별 ${star(e.stars)}개`
            : `⭐ ${e.who} gave ${e.name} ${star(e.stars)} stars`) + quote(e.review)
      );
    case "game_rating":
      return (
        (e.again
          ? ko
            ? `🎲 ${e.who}님이 ${e.name} 점수를 ${e.score}/10으로 바꿨어요`
            : `🎲 ${e.who} changed their score for ${e.name} to ${e.score}/10`
          : ko
            ? `🎲 ${e.who}님이 ${e.name}에 ${e.score}/10점`
            : `🎲 ${e.who} gave ${e.name} ${e.score}/10`) + quote(e.review)
      );
    case "night_edit":
      return ko ? `🎲 ${e.who}님이 ${nightWhen(locale, e.at, e.tz)} 보드게임 나이트를 수정했어요` : `🎲 ${e.who} updated the board game night on ${nightWhen(locale, e.at, e.tz)}`;
    case "rsvp": {
      const when = nightWhen(locale, e.at, e.tz);
      if (e.status === "going") return ko ? `🙋 ${e.who}님이 ${when} 보드게임 나이트에 와요` : `🙋 ${e.who} is coming on ${when}`;
      if (e.status === "maybe") return ko ? `🤔 ${e.who}님이 ${when} 보드게임 나이트에 올지도 몰라요` : `🤔 ${e.who} might come on ${when}`;
      return ko ? `🙅 ${e.who}님은 ${when} 보드게임 나이트에 못 와요` : `🙅 ${e.who} can't make it on ${when}`;
    }
    case "photo":
      return ko ? `📷 ${e.who}님이 ${e.name} 사진을 올렸어요` : `📷 ${e.who} added photos of ${e.name}`;
    case "night_new":
      return ko ? `🎲 새 보드게임 나이트: ${nightWhen(locale, e.at, e.tz)}` : `🎲 New board game night: ${nightWhen(locale, e.at, e.tz)}`;
    case "night_game":
      return ko
        ? `🎲 ${e.who}님이 ${nightWhen(locale, e.at, e.tz)} 게임에 ${e.game}을(를) 넣었어요`
        : `🎲 ${e.who} picked ${e.game} for ${nightWhen(locale, e.at, e.tz)}`;
    case "chat": {
      const text = e.text.length > 120 ? `${e.text.slice(0, 117)}…` : e.text;
      return `💬 ${e.who}: ${text}`;
    }
    case "workout":
      return ko ? `💪 ${e.who}님이 ${e.day} 운동을 마쳤어요 (${e.minutes}분)` : `💪 ${e.who} finished ${e.day} (${e.minutes} min)`;
    case "night_tomorrow": {
      const extra = [e.where, e.games.join(", ")].filter(Boolean).map((x) => ` · ${x}`).join("");
      return ko ? `🎲 내일 보드게임 나이트! ${nightWhen(locale, e.at, e.tz)}${extra}` : `🎲 Board game night tomorrow! ${nightWhen(locale, e.at, e.tz)}${extra}`;
    }
  }
}

/** Where the app opens when the notification is tapped. */
export function pushPath(e: PushEvent) {
  switch (e.type) {
    case "restaurant":
      return `/restaurant/${e.itemId}`;
    case "dish":
      return `/dish/${e.itemId}`;
    case "menu":
      return `/menu/${e.itemId}`;
    case "game":
    case "game_rating":
      return `/game/${e.itemId}`;
    case "rating":
    case "photo":
    case "edit":
    case "visit":
      return `/${e.kind}/${e.itemId}`;
    case "chat":
      return `/group/${e.groupId}/chat`;
    case "workout":
      return `/group/${e.groupId}`;
    default:
      return `/night/${e.nightId}`;
  }
}

export type PushMessage = { token: string; platform: string; title: string; body: string; data: Record<string, string> };
/** "gone" = the token is no longer valid and is forgotten. */
export type PushSender = (m: PushMessage) => Promise<"ok" | "gone">;

let sender: PushSender | null | undefined;
/** Tests swap in a recorder. */
export function setPushSender(s: PushSender | null) {
  sender = s;
}
function currentSender() {
  if (sender === undefined) sender = platformSender(fcmSender(), apnsSender());
  return sender;
}

const pending = new Set<Promise<unknown>>();
/** Lets tests wait for queued pushes. */
export const flushPush = async () => {
  while (pending.size) await Promise.all([...pending]);
};

/**
 * Sends after the response (Next's after() keeps the function alive); never fails the request.
 * `except` is whoever caused it (they don't need to hear about it).
 */
export function notifyGroup(db: Db, groupId: string, except: string | null, event: PushEvent) {
  if (!currentSender()) return;
  const p = sendToGroup(db, groupId, except, event)
    .catch((e) => console.error("[push]", e instanceof Error ? e.message : e))
    .finally(() => pending.delete(p));
  pending.add(p);
  import("next/server")
    .then(({ after }) => after(() => p))
    .catch(() => {});
}

export async function sendToGroup(db: Db, groupId: string, except: string | null, event: PushEvent) {
  const send = currentSender();
  if (!send) return 0;
  const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId));
  const rows = await db
    .select({ token: pushTokens.token, platform: pushTokens.platform, locale: pushTokens.locale, userLocale: users.locale })
    .from(pushTokens)
    .innerJoin(memberships, and(eq(memberships.userId, pushTokens.userId), eq(memberships.groupId, groupId)))
    .innerJoin(users, eq(users.id, pushTokens.userId))
    .where(except ? ne(pushTokens.userId, except) : undefined);
  const gone: string[] = [];
  for (const r of rows) {
    const locale: Locale = (r.userLocale ?? r.locale) === "ko" ? "ko" : "en";
    const res = await send({ token: r.token, platform: r.platform, title: group?.name ?? "wanderbar", body: pushText(locale, event), data: { path: pushPath(event), type: event.type, groupId } }).catch(
      (e) => {
        console.error("[push.send]", e instanceof Error ? e.message : e);
        return "ok" as const;
      },
    );
    if (res === "gone") gone.push(r.token);
  }
  if (gone.length) await db.delete(pushTokens).where(inArray(pushTokens.token, gone));
  return rows.length;
}

/** Remembers this device for the signed-in user (moving it over if someone else used it before). */
export async function registerPushToken(db: Db, userId: string, input: { token: string; platform: string; locale?: string }) {
  const locale = input.locale === "ko" ? "ko" : "en";
  await db
    .insert(pushTokens)
    .values({ token: input.token, userId, platform: input.platform, locale })
    .onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform: input.platform, locale, updatedAt: new Date() } });
}

export async function unregisterPushToken(db: Db, userId: string, token: string) {
  await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.userId, userId)));
}

/** iPhones get Apple's push service directly; everything else goes through Firebase. */
function platformSender(fcm: PushSender | null, apns: PushSender | null): PushSender | null {
  if (!fcm && !apns) return null;
  return async (m) => {
    const s = m.platform === "ios" ? apns : fcm;
    if (!s) return "ok";
    return s(m);
  };
}

/**
 * APNs (HTTP/2, token auth) for the TestFlight/App Store app. Env: APNS_KEY (the .p8 key's text, or it
 * in base64), APNS_KEY_ID, APNS_TEAM_ID; APNS_TOPIC defaults to the app's bundle id. Null when not set.
 */
function apnsSender(): PushSender | null {
  const raw = process.env.APNS_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!raw || !keyId || !teamId) return null;
  const pem = raw.includes("BEGIN PRIVATE KEY") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const topic = process.env.APNS_TOPIC || "app.wanderbar.mobile";
  const host = process.env.APNS_HOST || "https://api.push.apple.com";
  let cached: { jwt: string; at: number } | null = null;
  const jwt = async () => {
    // Apple wants a token refreshed between 20 and 60 minutes.
    if (cached && Date.now() - cached.at < 40 * 60_000) return cached.jwt;
    const key = await importPKCS8(pem, "ES256");
    const token = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: keyId }).setIssuer(teamId).setIssuedAt().sign(key);
    cached = { jwt: token, at: Date.now() };
    return token;
  };
  return async (m) => {
    const { connect } = await import("node:http2");
    const payload = JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: "default" }, body: m.data });
    const auth = await jwt();
    const { status, text } = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const client = connect(host);
      client.on("error", reject);
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${m.token}`,
        authorization: `bearer ${auth}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      let status = 0;
      let text = "";
      req.on("response", (h) => (status = Number(h[":status"])));
      req.setEncoding("utf8");
      req.on("data", (c) => (text += c));
      req.on("end", () => {
        client.close();
        resolve({ status, text });
      });
      req.on("error", (e) => {
        client.close();
        reject(e);
      });
      req.end(payload);
    });
    if (status === 200) return "ok";
    if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(text)) return "gone";
    throw new Error(`apns ${status} ${text.slice(0, 200)}`);
  };
}

/** FCM HTTP v1 with a service account; null when not configured. */
function fcmSender(): PushSender | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  let sa: { client_email: string; private_key: string; project_id: string };
  try {
    sa = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    console.error("[push] FCM_SERVICE_ACCOUNT is not valid JSON");
    return null;
  }
  let cached: { token: string; until: number } | null = null;
  const accessToken = async () => {
    if (cached && cached.until > Date.now() + 60_000) return cached.token;
    const key = await importPKCS8(sa.private_key, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(sa.client_email)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!res.ok) throw new Error(`oauth ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: j.access_token, until: Date.now() + j.expires_in * 1000 };
    return cached.token;
  };
  return async (m) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: m.token,
          notification: { title: m.title, body: m.body },
          data: m.data,
          android: { priority: "high", notification: { channel_id: "group" } },
        },
      }),
    });
    if (res.ok) return "ok";
    const text = await res.text();
    if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text)) return "gone";
    throw new Error(`fcm ${res.status} ${text.slice(0, 200)}`);
  };
}
