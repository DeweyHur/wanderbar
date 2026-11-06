import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { Text, useColors } from "./ui";

/** The group home's title: tap it to switch to another group (or make a new one). */
export function GroupTitle({ name }: { name: string }) {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("group.switch")}
      testID="group-switcher"
      hitSlop={8}
      onPress={() => router.push("/groups")}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1, maxWidth: 260 })}
    >
      <Text numberOfLines={1} style={{ color: c.text, fontSize: 18, fontWeight: "700", flexShrink: 1 }}>
        {name}
      </Text>
      <Text style={{ color: c.accent, fontSize: 14 }}>▼</Text>
    </Pressable>
  );
}
