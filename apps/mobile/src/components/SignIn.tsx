import { useState } from "react";
import { useSession } from "@/lib/session";
import { Body, Button, ErrorText, Screen, Title, errorMessage } from "./ui";

export function SignIn({ message }: { message?: string }) {
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Screen>
      <Title>wanderbar</Title>
      <Body muted>{message ?? "우리끼리 메뉴 단위로 맛집을 기록하고, 담아 둔 곳으로 하루 동선을 짜요."}</Body>
      <Button
        label="구글로 로그인"
        busy={busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            await signIn();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
