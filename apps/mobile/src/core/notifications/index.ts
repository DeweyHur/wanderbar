import { fixedReminders, reminderSchedule, type FixedReminder, type FixedStop, type ReminderDay } from "@wanderbar/route";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import i18n from "@/core/i18n";
import { Platform } from "react-native";
import { api, onApiMutation } from "@/core/api";
import { prefs } from "@/core/platform/prefs";

/**
 * Notifications on the phone.
 * - Reminders (route day, shopping before a day at home) are scheduled locally from /api/me/reminders,
 *   and rescheduled after any change to routes, meals or shopping.
 * - Group news (new restaurants, ratings, photos, board game nights) is pushed by the server via FCM;
 *   this device's token is registered when that setting is on (Android).
 */

const REMINDERS_KEY = "notify_reminders";
const PUSH_KEY = "notify_push";
const TOKEN_KEY = "push_token";
const PREFIX = "wb-reminder-";

export const notificationsSupported = Platform.OS !== "web";
export const pushSupported = Platform.OS === "android" || Platform.OS === "ios";

Notifications.setNotificationHandler({
  // The rest timer's "rest's over" rings even with the app open; other notifications stay quiet.
  handleNotification: async (n) => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: n.request.content.data?.kind === "rest", shouldSetBadge: false }),
});

let ready: Promise<void> | null = null;
function setup() {
  ready ??= (async () => {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("reminders", { name: i18n.t("notify.channelReminders"), importance: Notifications.AndroidImportance.DEFAULT });
      await Notifications.setNotificationChannelAsync("group", { name: i18n.t("notify.channelGroup"), importance: Notifications.AndroidImportance.DEFAULT });
    }
  })();
  return ready;
}

/** Asks once (Android 13+ and iOS show a prompt); true when allowed. */
async function allowed(ask: boolean) {
  const now = await Notifications.getPermissionsAsync();
  if (now.granted) return true;
  if (!ask || !now.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export const settings = {
  reminders: async () => (await prefs.get(REMINDERS_KEY)) !== "off",
  push: async () => (await prefs.get(PUSH_KEY)) === "on",
};

const text = (r: ReturnType<typeof reminderSchedule>[number]) => {
  const name = r.title || r.firstStop || "";
  switch (r.kind) {
    case "routeTomorrow":
      return { title: i18n.t("notify.routeTomorrowTitle"), body: i18n.t("notify.routeBody", { name, count: r.stops }) };
    case "routeToday":
      return { title: i18n.t("notify.routeTodayTitle"), body: i18n.t("notify.routeBody", { name, count: r.stops }) };
    case "shopTomorrow":
      return { title: i18n.t("notify.shopTomorrowTitle"), body: i18n.t("notify.shopBody", { count: r.toBuy }) };
    case "shopToday":
      return { title: i18n.t("notify.shopTodayTitle"), body: i18n.t("notify.shopBody", { count: r.toBuy }) };
  }
};

const clock = (d: Date) => new Intl.DateTimeFormat(i18n.language, { hour: "numeric", minute: "2-digit" }).format(d);
const minutes = (sec: number) => i18n.t("food:fixed.driveMin", { count: Math.max(1, Math.round(sec / 60)) });
/** A fixed-time stop (reservation, show): when to leave. */
const fixedText = (r: FixedReminder, travelSeconds: number | null) => {
  const vars = { name: r.name, time: clock(r.fixedAt), from: r.from ?? "", drive: travelSeconds != null ? minutes(travelSeconds) : "" };
  const body = r.from && travelSeconds != null ? i18n.t("food:fixed.body", vars) : i18n.t("food:fixed.bodyNoFrom", vars);
  const title = { leaveSoon: "food:fixed.soonTitle", leaveNow: "food:fixed.nowTitle", fixedSoon: "food:fixed.hourTitle" }[r.kind];
  return { title: i18n.t(title, { name: r.name }), body };
};

/** Replaces this app's scheduled reminders with ones for my upcoming days. ask: may show the permission prompt. */
export async function syncReminders(ask = false) {
  if (!notificationsSupported) return;
  await setup();
  const old = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(old.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!(await settings.reminders())) return;
  const { days, fixed = [] } = await api<{ days: ReminderDay[]; fixed?: FixedStop[] }>("/api/me/reminders");
  const plan = reminderSchedule(days, new Date());
  const leave = fixedReminders(fixed, new Date());
  if ((!plan.length && !leave.length) || !(await allowed(ask))) return;
  // When to leave for reservations and shows: these matter most, so they go first.
  for (const r of leave) {
    await Notifications.scheduleNotificationAsync({
      identifier: PREFIX + r.id,
      content: { ...fixedText(r, fixed.find((f) => f.stopId === r.stopId)?.travelSeconds ?? null), sound: "default", data: { path: `/plan/${r.planId}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: "reminders" },
    });
  }
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: PREFIX + r.id,
      content: { ...text(r), data: { path: r.kind.startsWith("shop") ? `/group/${r.groupId}` : `/plan/${r.planId}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: "reminders" },
    });
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** After changes to routes, meals or shopping: reschedule a moment later (several changes, one sync). */
export function startReminderSync() {
  if (!notificationsSupported) return () => {};
  return onApiMutation((path) => {
    if (!/^\/api\/(plans|stops|meals|shopping|groups\/[^/]+\/(plans|shopping))/.test(path)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => syncReminders(true).catch(() => {}), 1500);
  });
}

export async function setReminders(on: boolean) {
  await prefs.set(REMINDERS_KEY, on ? "on" : "off");
  if (on) await allowed(true);
  await syncReminders(on);
}

/** Group news on this device: register (or drop) its FCM token with the server. */
export async function setPush(on: boolean) {
  if (!pushSupported) return false;
  await setup();
  if (!on) {
    await prefs.set(PUSH_KEY, "off");
    const token = await prefs.get(TOKEN_KEY);
    if (token) await api("/api/me/push-tokens", { method: "DELETE", body: { token } }).catch(() => {});
    await prefs.remove(TOKEN_KEY);
    return false;
  }
  if (!Device.isDevice || !(await allowed(true))) return false;
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  await api("/api/me/push-tokens", { body: { token, platform: Platform.OS, locale: i18n.language.startsWith("ko") ? "ko" : "en" } });
  await prefs.set(TOKEN_KEY, String(token));
  await prefs.set(PUSH_KEY, "on");
  return true;
}

/** On start (signed in): refresh the push token if group news is on, and the reminders. */
export async function refreshNotifications() {
  if (!notificationsSupported) return;
  if (await settings.push()) await setPush(true).catch(() => {});
  await syncReminders(false).catch(() => {});
}

/** Before signing out: this device stops getting the account's news and reminders. */
export async function forgetDevice() {
  if (!notificationsSupported) return;
  const token = await prefs.get(TOKEN_KEY);
  if (token) await api("/api/me/push-tokens", { method: "DELETE", body: { token } }).catch(() => {});
  await prefs.remove(TOKEN_KEY);
  const old = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(old.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

/** Tapping a notification opens what it's about. */
export function handleTaps() {
  const open = (r: Notifications.NotificationResponse | null) => {
    const path = r?.notification.request.content.data?.path;
    if (typeof path === "string" && path.startsWith("/")) router.push(path as never);
  };
  Notifications.getLastNotificationResponseAsync().then(open, () => {});
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
