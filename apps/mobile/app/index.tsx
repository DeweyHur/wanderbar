import { Redirect } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import { SignIn } from "@/components/SignIn";
import { Body, Button, ErrorText, Loading, Screen, Title, errorMessage, useColors } from "@/components/ui";
import { api, type GroupSummary } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function Home() {
  const { state } = useSession();
  if (state.status === "loading") return <Loading />;
  if (state.status === "signedOut") return <SignIn />;
  // MVP shows one group; the data model already allows several.
  const group = state.groups[0];
  if (group) return <Redirect href={{ pathname: "/group/[id]", params: { id: group.id } }} />;
  return <CreateGroup />;
}

function CreateGroup() {
  const { refresh, signOut } = useSession();
  const c = useColors();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Screen>
      <Title>그룹 만들기</Title>
      <Body muted>함께 기록할 사람들의 그룹을 만들어요. 초대 링크를 받았다면 그 링크를 눌러 들어오면 돼요.</Body>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="예: 맛집 탐방대"
        placeholderTextColor={c.muted}
        maxLength={60}
        style={[styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
      />
      <Button
        label="만들기"
        busy={busy}
        disabled={!name.trim()}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            await api<GroupSummary>("/api/groups", { body: { name } });
            await refresh();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      <ErrorText>{error}</ErrorText>
      <Button kind="plain" label="로그아웃" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: 17, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
});
