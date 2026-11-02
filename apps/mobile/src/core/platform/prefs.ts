import * as SecureStore from "expo-secure-store";

/** Small per-device settings (language, last group). Native: secure store. Web: prefs.web.ts. */
export const prefs = {
  get: (key: string) => SecureStore.getItemAsync(key).catch(() => null),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value).catch(() => {}),
  remove: (key: string) => SecureStore.deleteItemAsync(key).catch(() => {}),
};
