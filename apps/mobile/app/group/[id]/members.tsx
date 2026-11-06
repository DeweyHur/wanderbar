import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, StyleSheet, View } from "react-native";
import { Body, Button, ErrorText, Loading, Screen, useColors, Text } from "@/components/ui";
import { api, type GroupDetail } from "@/core/api";
import { errorText } from "@/core/errors";
import { shareText } from "@/core/platform/share";
import { useSession } from "@/core/session";

export default function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { state } = useSession();
  const otherGroups = state.status === "signedIn" ? state.groups.filter((g) => g.id !== id) : [];
  const c = useColors();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroup(await api<GroupDetail>(`/api/groups/${id}`));
    } catch (e) {
      setError(errorText(t, e));
    }
  }, [id, t]);
  useEffect(() => {
    load();
  }, [load]);

  if (!group) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const solo = group.members.length === 1;

  const invite = async () => {
    setInviting(true);
    setNotice("");
    try {
      const { url } = await api<{ url: string }>(`/api/groups/${group.id}/invites`, { method: "POST" });
      if ((await shareText(t("group.inviteMessage", { name: group.name, url }))) === "copied") setNotice(t("group.inviteCopied"));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setInviting(false);
    }
  };

  return (
    <Screen>
      <Body muted>{solo ? t("group.solo") : t("group.members", { count: group.members.length })}</Body>
      <FlatList
        data={group.members}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.name, { color: c.text }]}>{item.name ?? item.email}</Text>
            {item.role !== "member" && <Text style={{ color: c.accent }}>{t(`group.role.${item.role}`)}</Text>}
          </View>
        )}
        contentContainerStyle={{ gap: 8 }}
      />
      {group.myRole === "owner" && <Button label={t("group.invite")} busy={inviting} onPress={invite} />}
      {notice ? <Body muted>{notice}</Body> : null}
      {otherGroups.length > 0 && <Body muted>{t("group.others")}</Body>}
      {otherGroups.map((g) => (
        <Button key={g.id} kind="plain" label={t("group.switchTo", { name: g.name })} onPress={() => router.replace({ pathname: "/group/[id]", params: { id: g.id } })} />
      ))}
      <Button kind="plain" label={t("group.new")} onPress={() => router.push("/group/new")} />
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1 },
  name: { fontSize: 16, fontWeight: "500" },
});
