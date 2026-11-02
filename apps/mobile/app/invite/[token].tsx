import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { SignIn } from "@/components/SignIn";
import { Body, Button, ErrorText, Loading, Screen, Title, errorMessage } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

type Preview = { groupId: string; groupName: string };

/** Opened from wanderbar://invite/<token> (the invite web page's "앱에서 열기" button). */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { state, refresh } = useSession();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signedIn = state.status === "signedIn";

  useEffect(() => {
    if (!signedIn) return;
    api<Preview>(`/api/invites/${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch((e) =>
        setError(e instanceof ApiError && e.status === 404 ? "초대 링크를 찾을 수 없어요" : errorMessage(e)),
      );
  }, [signedIn, token]);

  if (state.status === "loading") return <Loading />;
  if (!signedIn) return <SignIn message="그룹 초대를 받으려면 먼저 구글로 로그인해 주세요." />;
  if (error) return <Screen><ErrorText>{error}</ErrorText></Screen>;
  if (!preview) return <Loading />;

  const alreadyIn = state.groups.some((g) => g.id === preview.groupId);
  return (
    <Screen>
      <Title>{preview.groupName}</Title>
      <Body muted>{alreadyIn ? "이미 이 그룹 멤버예요." : "이 그룹에 참여할까요? 그룹 안의 기록은 멤버끼리만 볼 수 있어요."}</Body>
      <Button
        label={alreadyIn ? "그룹으로 가기" : "참여하기"}
        busy={busy}
        onPress={async () => {
          setBusy(true);
          try {
            if (!alreadyIn) await api(`/api/invites/${encodeURIComponent(token)}/accept`, { method: "POST" });
            await refresh();
            router.replace({ pathname: "/group/[id]", params: { id: preview.groupId } });
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
      />
    </Screen>
  );
}
