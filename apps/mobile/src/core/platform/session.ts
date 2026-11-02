import * as SecureStore from "expo-secure-store";

const KEY = "session_token";

/** Apps hold the session as a bearer token in the secure store. */
export const sessionStore = {
  mode: "bearer" as "bearer" | "cookie",
  load: () => SecureStore.getItemAsync(KEY).catch(() => null),
  save: async (token: string | null) => {
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY).catch(() => {});
  },
};
