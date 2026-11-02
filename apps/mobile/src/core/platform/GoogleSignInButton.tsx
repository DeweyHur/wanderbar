import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { googleIdToken } from "./google";

/** Native: our own button that opens the system Google sign-in sheet. */
export function GoogleSignInButton({ onIdToken, onError }: { onIdToken: (t: string) => Promise<void>; onError: (e: unknown) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label={t("signIn.google")}
      busy={busy}
      onPress={async () => {
        setBusy(true);
        try {
          const token = await googleIdToken();
          if (token) await onIdToken(token);
        } catch (e) {
          onError(e);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
