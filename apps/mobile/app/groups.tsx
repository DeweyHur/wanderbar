import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Body, Button, Card, Text, useColors } from "@/components/ui";
import { loadLastGroup, saveLastGroup } from "@/core/lastGroup";
import { useSession } from "@/core/session";

const ICON: Record<string, string> = { food: "🍜", boardgame: "🎲" };

/** All my groups: tap one to open it; or make a new one. */
export default function Groups() {
  const { t } = useTranslation();
  const c = useColors();
  const { state, refresh } = useSession();
  const [currentId, setCurrentId] = useState<string | null>(null);
  useEffect(() => {
    loadLastGroup().then(setCurrentId);
  }, []);
  // Groups joined on another device show up too.
  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh]),
  );
  const groups = state.status === "signedIn" ? state.groups : [];

  const open = async (id: string) => {
    await saveLastGroup(id);
    if (router.canDismiss()) router.dismissAll();
    router.replace({ pathname: "/group/[id]", params: { id } });
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 12 }}>
      <Stack.Screen options={{ title: t("group.mine") }} />
      {groups.map((g) => (
        <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={g.name} onPress={() => open(g.id)}>
          <Card testID="group-row" highlight={g.id === currentId}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ fontSize: 26 }}>{ICON[g.module] ?? "•"}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }} numberOfLines={1}>
                  {g.name}
                </Text>
                <Body muted>
                  {g.module === "boardgame" ? t("group.kindBoardgame") : t("group.kindFood")}
                  {g.role !== "member" ? ` · ${t(`group.role.${g.role}`)}` : ""}
                </Body>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
      <Button kind="plain" label={t("group.new")} onPress={() => router.push("/group/new")} />
    </ScrollView>
  );
}
