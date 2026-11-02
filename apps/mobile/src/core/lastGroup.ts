import { prefs } from "./platform/prefs";

const KEY = "last_group_id";

export const loadLastGroup = () => prefs.get(KEY);
export const saveLastGroup = (id: string) => prefs.set(KEY, id);
