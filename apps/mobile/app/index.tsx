import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { SignIn } from "@/components/SignIn";
import { Button, ErrorText, Loading, Screen, errorMessage } from "@/components/ui";
import { api, type GroupSummary } from "@/lib/api";
import { loadLastGroup } from "@/lib/lastGroup";
import { useSession } from "@/lib/session";

const PERSONAL_GROUP_NAME = "내 기록";

export default function Home() {
  const { state } = useSession();
  if (state.status === "loading") return <Loading />;
  if (state.status === "signedOut") return <SignIn />;
  if (state.groups.length === 0) return <CreatePersonalGroup />;
  return <OpenGroup groups={state.groups} />;
}

/** Opens the group used last time (several groups are possible once someone is invited elsewhere). */
function OpenGroup({ groups }: { groups: GroupSummary[] }) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    loadLastGroup().then((last) => setId(groups.some((g) => g.id === last) ? last! : groups[0].id));
  }, [groups]);
  if (!id) return <Loading />;
  return <Redirect href={{ pathname: "/group/[id]", params: { id } }} />;
}

/**
 * Works solo from the first sign-in: a personal group is created automatically,
 * and inviting others is optional. (Someone who arrives through an invite link joins
 * that group instead and never sees this.)
 */
function CreatePersonalGroup() {
  const { refresh, signOut } = useSession();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api<GroupSummary>("/api/groups", { body: { name: PERSONAL_GROUP_NAME } });
        if (!cancelled) await refresh();
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, refresh]);

  if (!error) return <Loading />;
  return (
    <Screen>
      <ErrorText>{error}</ErrorText>
      <Button label="다시 시도" onPress={() => { setError(""); setAttempt((n) => n + 1); }} />
      <Button kind="plain" label="로그아웃" onPress={signOut} />
    </Screen>
  );
}
