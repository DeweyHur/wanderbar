/** The web app has no notifications (reminders and group news are on the phone apps). */
export const notificationsSupported = false;
export const pushSupported = false;
export const settings = { reminders: async () => false, push: async () => false };
export async function syncReminders() {}
export const startReminderSync = () => () => {};
export async function setReminders() {}
export async function setPush() {
  return false;
}
export async function refreshNotifications() {}
export async function forgetDevice() {}
export const handleTaps = () => () => {};
