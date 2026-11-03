import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const GSI_SRC = "https://accounts.google.com/gsi/client";
let loading: Promise<void> | null = null;

function loadGsi() {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("network"));
    document.head.appendChild(s);
  });
  return loading;
}

/** Web: Google Identity Services renders its own button and hands back an ID token. */
export function GoogleSignInButton({ onIdToken, onError }: { onIdToken: (t: string) => Promise<void>; onError: (e: unknown) => void }) {
  const { i18n } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        const el = ref.current;
        const gsi = window.google?.accounts.id;
        if (cancelled || !el || !gsi) return;
        // Redirect mode: the page goes to Google and comes back (POST /api/auth/google/redirect sets the
        // session cookie). No popup, so popup blockers and in-app browsers (KakaoTalk, etc.) can't stop it.
        document.cookie = `wb_return=${encodeURIComponent(location.pathname + location.search)}; Path=/; Secure; SameSite=None; Max-Age=900`;
        gsi.initialize({
          client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
          ux_mode: "redirect",
          login_uri: `${location.origin}/api/auth/google/redirect`,
          // E2E and local tools that inject a token still use the callback.
          callback: (r) => onIdToken(r.credential).catch(onError),
        });
        el.innerHTML = "";
        gsi.renderButton(el, { theme: "outline", size: "large", text: "continue_with", shape: "pill", width: 280, locale: i18n.language });
      })
      .catch(onError);
    return () => {
      cancelled = true;
    };
  }, [i18n.language, onIdToken, onError]);

  // A plain DOM node: GIS draws its own iframe button into it.
  return <div ref={ref} style={{ minHeight: 44, display: "flex", justifyContent: "center" }} />;
}
