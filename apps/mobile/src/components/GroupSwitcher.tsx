import { router } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { loadLastGroup, saveLastGroup } from "@/core/lastGroup";
import { useSession } from "@/core/session";
import { isThemeId, Text, THEMES, useColors, useTheme } from "./ui";

const ICON: Record<string, string> = { food: "🍜", boardgame: "🎲" };

/**
 * The bar at the top of every group screen (home, game night, game, schedule, members): which group
 * you're in, in its color; tap to switch groups. It also puts the app in that group's theme, so a
 * night or game opened from a link looks like its group.
 */
export function GroupBar({ groupId }: { groupId?: string | null }) {
  const { t } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const { setThemeId } = useTheme();
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => {
    if (!groupId) loadLastGroup().then(setLastId, () => {});
  }, [groupId]);
  const id = groupId ?? lastId;
  const groups = state.status === "signedIn" ? state.groups : [];
  const g = groups.find((x) => x.id === id);
  useEffect(() => {
    if (!g) return;
    setThemeId(isThemeId(g.theme) ? g.theme : "pink");
    saveLastGroup(g.id);
  }, [g, setThemeId]);
  if (!g) return null;
  const fill = (isThemeId(g.theme) ? THEMES[g.theme] : THEMES.pink).pink;
  return (
    <Pressable
      testID="group-bar"
      accessibilityRole="button"
      accessibilityLabel={`${g.name} · ${t("group.switch")}`}
      onPress={() => router.push("/groups")}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        alignSelf: "stretch",
        backgroundColor: c.card,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingLeft: 6,
        paddingRight: 16,
        paddingVertical: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: fill, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 17 }}>{ICON[g.module] ?? "•"}</Text>
      </View>
      <Text numberOfLines={1} style={{ color: c.text, fontSize: 17, fontWeight: "700", flex: 1 }}>
        {g.name}
      </Text>
      {groups.length > 1 ? <Text style={{ color: c.muted, fontSize: 13 }}>{t("group.switch")}</Text> : null}
      <Text style={{ color: c.accent, fontSize: 13 }}>▼</Text>
    </Pressable>
  );
}
