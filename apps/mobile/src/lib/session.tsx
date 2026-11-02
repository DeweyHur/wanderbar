import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, loadToken, saveToken, type GroupSummary, type Me, type User } from "./api";

GoogleSignin.configure({
  // ID tokens are issued for the Web client ID; that's the audience the server checks.
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

type State = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: User; groups: GroupSummary[] };

type Session = {
  state: State;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const me = await api<Me>("/api/me");
      setState({ status: "signedIn", user: me.user, groups: me.groups });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await saveToken(null);
        setState({ status: "signedOut" });
      } else {
        throw e;
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!(await loadToken())) return setState({ status: "signedOut" });
      try {
        await refresh();
      } catch {
        // Offline or server down: keep the user out of a half-signed-in state but don't drop the token.
        setState({ status: "signedOut" });
      }
    })();
  }, [refresh]);

  const signIn = useCallback(async () => {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return; // cancelled
    const idToken = res.data.idToken;
    if (!idToken) throw new Error("구글 ID 토큰을 받지 못했어요 (webClientId 설정 확인)");
    const out = await api<Me & { token: string }>("/api/auth/google", { body: { idToken } });
    await saveToken(out.token);
    setState({ status: "signedIn", user: out.user, groups: out.groups });
  }, []);

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    await GoogleSignin.signOut().catch(() => {});
    await saveToken(null);
    setState({ status: "signedOut" });
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut, refresh }), [state, signIn, signOut, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
