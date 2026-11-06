import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { errorText } from "@/core/errors";
import { GoogleSignInButton } from "@/core/platform/GoogleSignInButton";
import { api } from "@/core/api";
import { useSession } from "@/core/session";
import { Body, Button, ErrorText, Screen, Title } from "./ui";

/** Fixed test users for the staging site (and end-to-end tests): no password, no Google. */
const TEST_USERS = [
  { email: "tester-a@staging.wanderbar.app", name: "Tester A" },
  { email: "tester-b@staging.wanderbar.app", name: "Tester B" },
];

/** Only when the server says test sign-in is on (it is off in production). Web only: it uses the cookie session. */
function TestSignIn({ onError }: { onError: (e: unknown) => void }) {
  const { t } = useTranslation();
  const { refresh } = useSession();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    api<{ testLogin?: boolean }>("/api/config").then((c) => setOn(!!c.testLogin), () => {});
  }, []);
  if (!on) return null;
  return (
    <>
      <Body muted>{t("signIn.testHint")}</Body>
      {TEST_USERS.map((u) => (
        <Button
          key={u.email}
          kind="plain"
          label={t("signIn.testAs", { name: u.name })}
          onPress={() => api("/api/auth/test-login", { body: u }).then(refresh, onError)}
        />
      ))}
    </>
  );
}

export function SignIn({ message }: { message?: string }) {
  const { t } = useTranslation();
  const { signInWithIdToken } = useSession();
  // Web redirect sign-in comes back with ?signin=failed|csrf when Google's answer couldn't be used.
  const [error, setError] = useState(() =>
    Platform.OS === "web" && /[?&]signin=(failed|csrf)/.test(globalThis.location?.search ?? "") ? t("errors.auth.invalid_google_token") : "",
  );
  const onIdToken = useCallback(
    async (idToken: string) => {
      setError("");
      await signInWithIdToken(idToken);
    },
    [signInWithIdToken],
  );
  const onError = useCallback((e: unknown) => setError(errorText(t, e)), [t]);
  return (
    <Screen>
      <Title>{t("appName")}</Title>
      <Body muted>{message ?? t("tagline")}</Body>
      <GoogleSignInButton onIdToken={onIdToken} onError={onError} />
      <TestSignIn onError={onError} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
