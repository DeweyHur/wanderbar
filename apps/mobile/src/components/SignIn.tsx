import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "@/core/errors";
import { GoogleSignInButton } from "@/core/platform/GoogleSignInButton";
import { useSession } from "@/core/session";
import { Body, ErrorText, Screen, Title } from "./ui";

export function SignIn({ message }: { message?: string }) {
  const { t } = useTranslation();
  const { signInWithIdToken } = useSession();
  const [error, setError] = useState("");
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
