import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Share, StyleSheet, Text, View } from "react-native";
import { Body, Button, ErrorText, Loading, Screen, errorMessage, useColors } from "@/components/ui";
import { api, type GroupDetail } from "@/lib/api";
import { useSession } from "@/lib/session";
import { saveLastGroup } from "@/lib/lastGroup";

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, signOut } = useSession();
  const otherGroups = state.status === "signedIn" ? state.groups.filter((g) => g.id !== id) : [];
  const c = useColors();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroup(await api<GroupDetail>(`/api/groups/${id}`));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    load();
    saveLastGroup(id);
  }, [load, id]);

  if (!group) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const invite = async () => {
    setInviting(true);
    try {
      const { url } = await api<{ url: string }>(`/api/groups/${group.id}/invites`, { method: "POST" });
      await Share.share({ message: `"${group.name}" 그룹에 초대해요. 7일 안에 열어 주세요.\n${url}` });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setInviting(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: group.name }} />
      <Body muted>
        {group.members.length === 1
          ? "지금은 혼자 쓰는 중이에요. 기록은 나만 볼 수 있고, 원하면 언제든 초대할 수 있어요."
          : `멤버 ${group.members.length}명`}
      </Body>
      <FlatList
        data={group.members}
        keyExtractor={(m) => m.id}
        onRefresh={load}
        refreshing={false}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.name, { color: c.text }]}>{item.name ?? item.email}</Text>
            {item.role === "owner" && <Text style={{ color: c.accent }}>그룹장</Text>}
          </View>
        )}
        contentContainerStyle={{ gap: 8 }}
      />
      {group.myRole === "owner" && (
        <Button kind={group.members.length === 1 ? "plain" : "primary"} label="초대 링크 보내기" busy={inviting} onPress={invite} />
      )}
      {otherGroups.map((g) => (
        <Button
          key={g.id}
          kind="plain"
          label={`${g.name}(으)로 바꾸기`}
          onPress={() => router.replace({ pathname: "/group/[id]", params: { id: g.id } })}
        />
      ))}
      <ErrorText>{error}</ErrorText>
      <Button kind="plain" label="로그아웃" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1 },
  name: { fontSize: 16, fontWeight: "500" },
});
