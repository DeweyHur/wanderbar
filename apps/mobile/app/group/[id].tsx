import { Link, Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Body, Button, ErrorText, Loading, Screen, useColors } from "@/components/ui";
import { api, type GroupDetail } from "@/core/api";
import { errorText } from "@/core/errors";
import { saveLastGroup } from "@/core/lastGroup";
import { getModule } from "@/core/modules/registry";
import { shareText } from "@/core/platform/share";
import { useSession } from "@/core/session";

export default function GroupScreen() {
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
      setError("");
    } catch (e) {
      setError(errorText(t, e));
    }
  }, [id, t]);

  useEffect(() => {
    load();
    saveLastGroup(id);
  }, [load, id]);

  const settingsButton = () => (
    <Link href="/settings" asChild>
      <Pressable accessibilityRole="button" hitSlop={10}>
        <Text style={{ color: c.accent, fontSize: 16 }}>{t("common.settings")}</Text>
      </Pressable>
    </Link>
  );

  if (!group)
    return error ? (
      <Screen>
        <Stack.Screen options={{ headerRight: settingsButton }} />
        <ErrorText>{error}</ErrorText>
      </Screen>
    ) : (
      <Loading />
    );

  const mod = getModule(group.module);
  const solo = group.members.length === 1;

  const invite = async () => {
    setInviting(true);
    setNotice("");
    try {
      const { url } = await api<{ url: string }>(`/api/groups/${group.id}/invites`, { method: "POST" });
      const how = await shareText(t("group.inviteMessage", { name: group.name, url }));
      if (how === "copied") setNotice(t("group.inviteCopied"));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setInviting(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: group.name, headerRight: settingsButton }} />
      <Body muted>{mod ? t(`${mod.namespace}:name`) : t("group.moduleUnavailable")}</Body>
      <Body muted>{solo ? t("group.solo") : t("group.members", { count: group.members.length })}</Body>
      <FlatList
        data={group.members}
        keyExtractor={(m) => m.id}
        onRefresh={load}
        refreshing={false}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.name, { color: c.text }]}>{item.name ?? item.email}</Text>
            {item.role !== "member" && <Text style={{ color: c.accent }}>{t(`group.role.${item.role}`)}</Text>}
          </View>
        )}
        contentContainerStyle={{ gap: 8 }}
      />
      {group.myRole === "owner" && (
        <Button kind={solo ? "plain" : "primary"} label={t("group.invite")} busy={inviting} onPress={invite} />
      )}
      {notice ? <Body muted>{notice}</Body> : null}
      {otherGroups.map((g) => (
        <Button
          key={g.id}
          kind="plain"
          label={t("group.switchTo", { name: g.name })}
          onPress={() => router.replace({ pathname: "/group/[id]", params: { id: g.id } })}
        />
      ))}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1 },
  name: { fontSize: 16, fontWeight: "500" },
});
