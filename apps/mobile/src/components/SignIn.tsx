import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { errorText } from "@/core/errors";
import { GoogleSignInButton } from "@/core/platform/GoogleSignInButton";
import { useSession } from "@/core/session";
import { Body, ErrorText, Screen, Title } from "./ui";

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
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
