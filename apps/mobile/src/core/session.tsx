import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { forgetDevice } from "@/core/notifications";
import { Platform } from "react-native";
import { api, ApiError, loadToken, mightHaveSession, saveToken, type GroupSummary, type Me, type User } from "./api";
import i18n, { isLanguage, savedLanguage } from "./i18n";
import { googleSignOut } from "./platform/google";

type State = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: User; groups: GroupSummary[] };

type Session = {
  state: State;
  /** Exchange a Google ID token for an app session. */
  signInWithIdToken: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/** The account's saved language follows the user across devices unless this device has its own pick. */
async function adoptAccountLanguage(user: User) {
  if (isLanguage(user.locale) && !(await savedLanguage()) && i18n.language !== user.locale) {
    await i18n.changeLanguage(user.locale);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const signedIn = useCallback(async (me: Me) => {
    await adoptAccountLanguage(me.user);
    setState({ status: "signedIn", user: me.user, groups: me.groups });
  }, []);

  const refresh = useCallback(async () => {
    try {
      await signedIn(await api<Me>("/api/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await saveToken(null);
        setState({ status: "signedOut" });
      } else {
        throw e;
      }
    }
  }, [signedIn]);

  useEffect(() => {
    (async () => {
      await loadToken();
      if (!mightHaveSession()) return setState({ status: "signedOut" });
      try {
        await refresh();
      } catch {
        setState({ status: "signedOut" });
      }
    })();
  }, [refresh]);

  const signInWithIdToken = useCallback(
    async (idToken: string) => {
      const client = Platform.OS === "web" ? "web" : "app";
      const out = await api<Me & { token?: string }>("/api/auth/google", { body: { idToken, client } });
      if (out.token) await saveToken(out.token);
      await signedIn(out);
    },
    [signedIn],
  );

  const signOut = useCallback(async () => {
    await forgetDevice().catch(() => {});
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    googleSignOut();
    await saveToken(null);
    setState({ status: "signedOut" });
  }, []);

  const value = useMemo(() => ({ state, signInWithIdToken, signOut, refresh }), [state, signInWithIdToken, signOut, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
