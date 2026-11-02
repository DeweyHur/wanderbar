import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SignIn } from "@/components/SignIn";
import { Body, Button, ErrorText, Loading, Screen, Title } from "@/components/ui";
import { api } from "@/core/api";
import { errorText } from "@/core/errors";
import { useSession } from "@/core/session";

type Preview = { groupId: string; groupName: string };

/** Invite links are web URLs (/invite/<token>): the web app handles them directly, apps via wanderbar://invite/<token>. */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();
  const { state, refresh } = useSession();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signedIn = state.status === "signedIn";

  useEffect(() => {
    if (!signedIn) return;
    api<Preview>(`/api/invites/${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch((e) => setError(errorText(t, e)));
  }, [signedIn, token, t]);

  if (state.status === "loading") return <Loading />;
  if (!signedIn) return <SignIn message={t("signIn.inviteFirst")} />;
  if (error) return <Screen><ErrorText>{error}</ErrorText></Screen>;
  if (!preview) return <Loading />;

  const alreadyIn = state.groups.some((g) => g.id === preview.groupId);
  return (
    <Screen>
      <Title>{preview.groupName}</Title>
      <Body muted>{alreadyIn ? t("invite.alreadyMember") : t("invite.joinPrompt")}</Body>
      <Button
        label={alreadyIn ? t("invite.goToGroup") : t("invite.join")}
        busy={busy}
        onPress={async () => {
          setBusy(true);
          try {
            if (!alreadyIn) await api(`/api/invites/${encodeURIComponent(token)}/accept`, { method: "POST" });
            await refresh();
            router.replace({ pathname: "/group/[id]", params: { id: preview.groupId } });
          } catch (e) {
            setError(errorText(t, e));
            setBusy(false);
          }
        }}
      />
    </Screen>
  );
}
