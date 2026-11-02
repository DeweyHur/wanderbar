import * as SecureStore from "expo-secure-store";

const KEY = "last_group_id";

export const loadLastGroup = () => SecureStore.getItemAsync(KEY).catch(() => null);
export const saveLastGroup = (id: string) => SecureStore.setItemAsync(KEY, id).catch(() => {});
