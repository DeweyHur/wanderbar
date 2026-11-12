import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text as RNText, View } from "react-native";
import { api } from "@/core/api";
import { errorText } from "@/core/errors";
import { useSession } from "@/core/session";
import { FONT_IDS, FONT_SETS, Text, THEME_IDS, THEMES, useColors, useFontSet, useTheme, type FontId, type ThemeId } from "./ui";

/** The group's color theme, chosen by the owner; everyone in the group sees it. */
export function ThemePicker({ groupId, current, onError, readOnly }: { groupId: string; current: string | undefined; onError: (s: string) => void; readOnly?: boolean }) {
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
              disabled={readOnly}
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

/** The group's font set, chosen by the owner. Each choice is written in its own font once it's loaded. */
export function FontPicker({ groupId, current, onError, readOnly }: { groupId: string; current: string | undefined; onError: (s: string) => void; readOnly?: boolean }) {
  const { t } = useTranslation();
  const c = useColors();
  const { setFontId, fontId } = useTheme();
  const active = useFontSet();
  const { refresh } = useSession();
  const [chosen, setChosen] = useState(current ?? "round");
  useEffect(() => setChosen(current ?? "round"), [current]);
  const pick = async (id: FontId) => {
    setChosen(id);
    setFontId(id);
    try {
      await api(`/api/groups/${groupId}`, { method: "PATCH", body: { font: id } });
      await refresh();
    } catch (e) {
      onError(errorText(t, e));
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600" }}>{t("group.font")}</Text>
      {FONT_IDS.map((id) => {
        const on = chosen === id;
        // Fonts not fetched yet would fall back anyway; show the sample in the face we know is there.
        const f = id === "round" || id === "clean" ? FONT_SETS[id] : id === fontId ? active : FONT_SETS.round;
        return (
          <Pressable
            key={id}
            testID={`font-${id}`}
            accessibilityRole="button"
            accessibilityLabel={t(`group.fonts.${id}`)}
            accessibilityState={{ selected: on }}
            disabled={readOnly}
            onPress={() => pick(id)}
            style={({ pressed }) => ({
              borderWidth: on ? 2.5 : 1.5,
              borderColor: on ? c.accent : c.border,
              backgroundColor: c.card,
              borderRadius: 18,
              paddingHorizontal: 16,
              paddingVertical: 12,
              gap: 2,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <RNText style={{ color: c.text, fontSize: 18, ...(f.heading ? { fontFamily: f.heading } : { fontWeight: "700" }) }}>
              {on ? "✓ " : ""}
              {t(`group.fonts.${id}`)}
            </RNText>
            <RNText style={{ color: c.muted, fontSize: 15, ...(f.body ? { fontFamily: f.body } : {}) }}>{t("group.fontSample")}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
