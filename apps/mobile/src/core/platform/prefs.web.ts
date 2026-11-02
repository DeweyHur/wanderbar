/** Web: localStorage, which can be missing or throw (private mode); callers treat that as "nothing saved". */
export const prefs = {
  get: async (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: async (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  },
  remove: async (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {}
  },
};
