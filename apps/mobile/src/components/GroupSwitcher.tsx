import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
export function GroupBar({ groupId, chat = true }: { groupId?: string | null; chat?: boolean }) {
  const { t } = useTranslation();
  const c = useColors();
  const { state, refresh } = useSession();
  // Coming back to a group screen (e.g. from the chat) updates the unread count.
  useFocusEffect(
    useCallback(() => {
      if (chat) refresh().catch(() => {});
    }, [chat, refresh]),
  );
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
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        alignSelf: "stretch",
      }}
    >
      <Pressable
        testID="group-bar"
        accessibilityRole="button"
        accessibilityLabel={`${g.name} · ${t("group.switch")}`}
        onPress={() => router.push("/groups")}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          flex: 1,
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
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: fill,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 17 }}>{ICON[g.module] ?? "•"}</Text>
        </View>
        <Text numberOfLines={1} style={{ color: c.text, fontSize: 17, fontWeight: "700", flex: 1 }}>
          {g.name}
        </Text>
        {groups.length > 1 ? <Text style={{ color: c.muted, fontSize: 13 }}>{t("group.switch")}</Text> : null}
        <Text style={{ color: c.accent, fontSize: 13 }}>▼</Text>
      </Pressable>
      {chat && <ChatButton groupId={g.id} unread={g.unread ?? 0} />}
    </View>
  );
}

/** 💬 with a count of messages you haven't seen. */
function ChatButton({ groupId, unread }: { groupId: string; unread: number }) {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <Pressable
      testID="chat-button"
      accessibilityRole="button"
      accessibilityLabel={unread ? t("chat.openUnread", { count: unread }) : t("chat.open")}
      onPress={() => router.push({ pathname: "/group/[id]/chat", params: { id: groupId } })}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: c.card,
        borderColor: c.border,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontSize: 20 }}>💬</Text>
      {unread > 0 && (
        <View
          testID="chat-unread"
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            paddingHorizontal: 5,
            backgroundColor: c.danger,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}
