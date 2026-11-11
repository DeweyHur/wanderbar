import * as Notifications from "expo-notifications";
import { Platform, Vibration } from "react-native";

/**
 * "Rest's over" on the phone: a local notification scheduled for the end of the rest, so it comes with
 * the screen off or the app in the background. Android 12+ only delivers it on time with the
 * "Alarms & reminders" permission (otherwise it may be late); `exactAllowed` / `askExact` handle that.
 */

const ID = "wb-rest";
const CHANNEL = "workout";
export const restAlarmSupported = true;

let ready: Promise<void> | null = null;
const setup = (channelName: string) =>
  (ready ??= (async () => {
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: channelName,
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 400, 200, 400],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
  })());

/** Asks for notifications once (at the first workout); true when allowed. */
export async function prepareRestAlarm(channelName: string) {
  await setup(channelName);
  const now = await Notifications.getPermissionsAsync();
  if (now.granted) return true;
  if (!now.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Android: whether rest alarms can ring on the exact second. */
export async function exactAllowed() {
  if (Platform.OS !== "android") return true;
  try {
    return (await Notifications.getExactAlarmPermissionsAsync()).granted;
  } catch {
    return true;
  }
}

/** Opens Android's "Alarms & reminders" setting for this app. */
export async function askExact() {
  try {
    return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function scheduleRest(at: Date, content: { title: string; body: string; path: string }) {
  await Notifications.cancelScheduledNotificationAsync(ID).catch(() => {});
  if (at.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: ID,
    content: { title: content.title, body: content.body, sound: "default", data: { path: content.path, kind: "rest" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
  }).catch(() => {});
}

export async function cancelRest() {
  await Notifications.cancelScheduledNotificationAsync(ID).catch(() => {});
  await Notifications.dismissNotificationAsync(ID).catch(() => {});
}

/** The rest ended while the screen is open: buzz. */
export const buzz = () => Vibration.vibrate([0, 400, 200, 400]);
