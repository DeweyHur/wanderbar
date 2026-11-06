import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { api } from "@/core/api";
import { errorText } from "@/core/errors";
import { useSession } from "@/core/session";
import { Text, THEME_IDS, THEMES, useColors, useTheme, type ThemeId } from "./ui";

/** The group's color theme, chosen by the owner; everyone in the group sees it. */
export function ThemePicker({ groupId, current, onError }: { groupId: string; current: string | undefined; onError: (s: string) => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const { setThemeId } = useTheme();
  const { refresh } = useSession();
  const [chosen, setChosen] = useState(current ?? "pink");
  useEffect(() => setChosen(current ?? "pink"), [current]);
  const pick = async (id: ThemeId) => {
    setChosen(id);
    setThemeId(id);
    try {
      await api(`/api/groups/${groupId}`, { method: "PATCH", body: { theme: id } });
      await refresh();
    } catch (e) {
      onError(errorText(t, e));
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600" }}>{t("group.theme")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {THEME_IDS.map((id) => {
          const p = THEMES[id];
          const on = chosen === id;
          return (
            <Pressable
              key={id}
              testID={`theme-${id}`}
              accessibilityRole="button"
              accessibilityLabel={t(`group.themes.${id}`)}
              accessibilityState={{ selected: on }}
              onPress={() => pick(id)}
              style={({ pressed }) => ({ alignItems: "center", gap: 4, opacity: pressed ? 0.6 : 1 })}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: p.bg,
                  borderWidth: on ? 3 : 1,
                  borderColor: on ? c.accent : c.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: p.pink, borderWidth: 2, borderColor: p.accent, alignItems: "center", justifyContent: "center" }}>
                  {on ? <Text style={{ color: p.onPink, fontSize: 12 }}>✓</Text> : null}
                </View>
              </View>
              <Text style={{ color: on ? c.text : c.muted, fontSize: 12 }}>{t(`group.themes.${id}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
