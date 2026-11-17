import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { prefs } from "@/core/platform/prefs";
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  useColorScheme,
  View,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

/**
 * The look: baby pink and soft. Blush paper, pink pills, cocoa ink, round fonts
 * (Jua for headings and buttons, Gowun Dodum for reading). Each theme also has a dark version.
 */
export const palette = {
  bg: "#FFF3F6", // blush paper
  card: "#FFFFFF",
  text: "#4B3340", // cocoa ink
  muted: "#A08591",
  accent: "#D4618B", // rose: links, highlights, selected days
  pink: "#F8B4C9", // baby pink fills (primary buttons, selected chips)
  pinkSoft: "#FFE4EC", // chips at rest, input focus
  onPink: "#4B3340",
  border: "#F5D3DF",
  danger: "#D9506C",
  ok: "#4FA985", // mint: open, been there
  warn: "#D9952F", // honey
};
export type Palette = typeof palette & { dark?: boolean };

/** Group color themes. Ids match the server's GROUP_THEMES; the keys keep their names ("pink" = the fill color). */
export const THEMES = {
  pink: palette,
  mint: { ...palette, bg: "#EFFAF5", text: "#24413A", muted: "#7F9C93", accent: "#2E9C7A", pink: "#A8E3CF", pinkSoft: "#DDF4EB", onPink: "#24413A", border: "#CDEBDF" },
  sky: { ...palette, bg: "#F1F6FD", text: "#263A55", muted: "#8090A8", accent: "#3B7BD4", pink: "#B5D3F7", pinkSoft: "#E1EDFC", onPink: "#263A55", border: "#D2E2F6" },
  lavender: { ...palette, bg: "#F6F2FD", text: "#3E3354", muted: "#948AA8", accent: "#7C5CC4", pink: "#D4C6F4", pinkSoft: "#EDE6FB", onPink: "#3E3354", border: "#E2D8F6" },
  peach: { ...palette, bg: "#FFF5EE", text: "#4D3426", muted: "#A88C7C", accent: "#D9692E", pink: "#FFC9A6", pinkSoft: "#FFE8D8", onPink: "#4D3426", border: "#F7DCC9" },
  // Game night after dark.
  night: { bg: "#1D1B26", card: "#282536", text: "#EEE9F7", muted: "#A39DB8", accent: "#F2A7C3", pink: "#F2A7C3", pinkSoft: "#3A3550", onPink: "#2A2333", border: "#3A3550", danger: "#FF7A8A", ok: "#6CD4A6", warn: "#F5C26B", dark: true },
} satisfies Record<string, Palette>;
export type ThemeId = keyof typeof THEMES;

/** Each theme after dark: a deep background tinted with the theme's color, pastel accents on top. */
const darkBase = { danger: "#FF7A8A", ok: "#6CD4A6", warn: "#F5C26B", dark: true };
export const DARK_THEMES: Record<ThemeId, Palette> = {
  pink: { ...darkBase, bg: "#221A1F", card: "#2E2329", text: "#F6E8EE", muted: "#B39AA6", accent: "#F2A7C3", pink: "#F2A7C3", pinkSoft: "#43303A", onPink: "#2A1D24", border: "#46333D" },
  mint: { ...darkBase, bg: "#17221F", card: "#20302B", text: "#E3F4EE", muted: "#93B3A8", accent: "#7FD8B9", pink: "#7FD8B9", pinkSoft: "#2A4239", onPink: "#14231E", border: "#2F4740" },
  sky: { ...darkBase, bg: "#171D27", card: "#212A37", text: "#E5EEFA", muted: "#95A5BD", accent: "#8DB9F2", pink: "#8DB9F2", pinkSoft: "#2B3A50", onPink: "#142033", border: "#304056" },
  lavender: { ...darkBase, bg: "#1D1A26", card: "#282436", text: "#EEE8FA", muted: "#A69DBD", accent: "#B9A2EE", pink: "#B9A2EE", pinkSoft: "#3A3352", onPink: "#211A33", border: "#3D3556" },
  peach: { ...darkBase, bg: "#241C17", card: "#312620", text: "#F8EAE0", muted: "#B9A090", accent: "#F5A97A", pink: "#F5A97A", pinkSoft: "#47362B", onPink: "#2A1B12", border: "#4A392E" },
  night: THEMES.night,
};

/** Light or dark is each person's choice (not the group's): follow the phone, or always one of them. */
export const APPEARANCES = ["system", "light", "dark"] as const;
export type Appearance = (typeof APPEARANCES)[number];
const isAppearance = (x: unknown): x is Appearance => typeof x === "string" && (APPEARANCES as readonly string[]).includes(x);
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
export const isThemeId = (x: unknown): x is ThemeId => typeof x === "string" && x in THEMES;

/**
 * Font sets a group can pick. "round" (Jua headings, Gowun Dodum text) ships with the app; the others
 * are fetched the first time a group uses them. No family = the phone's own font.
 */
export const FONT_IDS = ["round", "clean", "bold", "hand"] as const;
export type FontId = (typeof FONT_IDS)[number];
export const isFontId = (x: unknown): x is FontId => typeof x === "string" && (FONT_IDS as readonly string[]).includes(x);
type FontSet = { heading?: string; body?: string; load?: () => Record<string, number> };
export const FONT_SETS: Record<FontId, FontSet> = {
  round: { heading: "Jua_400Regular", body: "GowunDodum_400Regular" },
  clean: {},
  bold: { heading: "DoHyeon_400Regular", load: () => ({ DoHyeon_400Regular: require("@expo-google-fonts/do-hyeon").DoHyeon_400Regular }) },
  hand: {
    heading: "NanumPenScript_400Regular",
    body: "NanumPenScript_400Regular",
    load: () => ({ NanumPenScript_400Regular: require("@expo-google-fonts/nanum-pen-script").NanumPenScript_400Regular }),
  },
};

type Look = {
  themeId: ThemeId;
  setThemeId: (t: ThemeId) => void;
  fontId: FontId;
  setFontId: (f: FontId) => void;
  font: FontSet;
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
  dark: boolean;
};
const ThemeContext = createContext<Look>({
  themeId: "pink",
  setThemeId: () => {},
  fontId: "round",
  setFontId: () => {},
  font: FONT_SETS.round,
  appearance: "system",
  setAppearance: () => {},
  dark: false,
});

/** The current group's theme and font; the last ones are remembered so the app opens without a flash. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setId] = useState<ThemeId>("pink");
  const [fontId, setFont] = useState<FontId>("round");
  const [appearance, setLook] = useState<Appearance>("system");
  const scheme = useColorScheme();
  const [loaded, setLoaded] = useState<Partial<Record<FontId, boolean>>>({ round: true, clean: true });
  useEffect(() => {
    prefs.get("theme").then((v) => isThemeId(v) && setId(v), () => {});
    prefs.get("font").then((v) => isFontId(v) && setFont(v), () => {});
    prefs.get("appearance").then((v) => isAppearance(v) && setLook(v), () => {});
  }, []);
  const setAppearance = useCallback((a: Appearance) => {
    setLook(a);
    prefs.set("appearance", a).catch(() => {});
  }, []);
  const dark = appearance === "dark" || (appearance === "system" && scheme === "dark");
  useEffect(() => {
    const set = FONT_SETS[fontId];
    if (loaded[fontId] || !set.load) return;
    import("expo-font")
      .then((Font) => Font.loadAsync(set.load!()))
      .then(() => setLoaded((l) => ({ ...l, [fontId]: true })), () => {});
  }, [fontId, loaded]);
  const setThemeId = useCallback((t: ThemeId) => {
    setId(t);
    prefs.set("theme", t).catch(() => {});
  }, []);
  const setFontId = useCallback((f: FontId) => {
    setFont(f);
    prefs.set("font", f).catch(() => {});
  }, []);
  // Until a fetched font has arrived, the round set (always there) stands in.
  const font = loaded[fontId] ? FONT_SETS[fontId] : FONT_SETS.round;
  const value = useMemo(
    () => ({ themeId, setThemeId, fontId, setFontId, font, appearance, setAppearance, dark }),
    [themeId, setThemeId, fontId, setFontId, font, appearance, setAppearance, dark],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export function useColors(): Palette {
  const { themeId, dark } = useContext(ThemeContext);
  return dark ? DARK_THEMES[themeId] : THEMES[themeId];
}

/** The fonts in use now (no family = the phone's own font). */
export const useFontSet = () => useContext(ThemeContext).font;

/** @deprecated The round set; use useFontSet() so a group's font choice shows. */
export const fonts = { heading: "Jua_400Regular", body: "GowunDodum_400Regular" };

/** Bold text uses the heading face (custom fonts can't be faux-bolded nicely on Android). */
function fontStyle(style: TextProps["style"], f: FontSet): TextStyle {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const w = flat.fontWeight;
  const heavy = w === "bold" || w === "600" || w === "700" || w === "800" || w === "900" || w === 600 || w === 700 || w === 800;
  const family = heavy ? f.heading : f.body;
  // The phone's font keeps real bold.
  return family ? { fontFamily: family, fontWeight: "normal" } : {};
}

/** Text in the group's fonts. Use instead of react-native's Text. */
export function Text(props: TextProps) {
  const f = useFontSet();
  return <RNText {...props} style={[props.style, fontStyle(props.style, f)]} />;
}

export function TextInput(props: TextInputProps) {
  const f = useFontSet();
  return <RNTextInput {...props} style={[props.style, f.body ? { fontFamily: f.body } : null]} />;
}

const squish = (pressed: boolean) => (pressed ? [{ scale: 0.96 }] : []);

export function Screen({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={[styles.screen, { backgroundColor: c.bg }]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.title, { color: c.text }]}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const c = useColors();
  return <Text style={[styles.body, { color: muted ? c.muted : c.text }]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const c = useColors();
  return children ? <Text style={[styles.body, { color: c.danger }]}>{children}</Text> : null;
}

export function Button({
  label,
  onPress,
  busy,
  kind = "primary",
  disabled,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  kind?: "primary" | "plain";
  disabled?: boolean;
  /** Drawn before the label, given the label's color. */
  icon?: (color: string) => ReactNode;
  testID?: string;
}) {
  const c = useColors();
  const primary = kind === "primary";
  const fg = primary ? c.onPink : c.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: c.pink } : { backgroundColor: c.card, borderColor: c.pink, borderWidth: 2 },
        { opacity: disabled ? 0.5 : 1, transform: squish(pressed) },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? c.onPink : c.text} />
      ) : icon ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {icon(fg)}
          <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
        </View>
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Loading() {
  return (
    <Screen>
      <ActivityIndicator style={{ marginTop: 80 }} />
    </Screen>
  );
}


const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 14 },
  title: { fontSize: 28, fontWeight: "700", marginTop: 12 },
  body: { fontSize: 16, lineHeight: 24 },
  button: { minHeight: 54, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  buttonText: { fontSize: 18, fontWeight: "700" },
});

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  multiline,
  onSubmitEditing,
  onBlur,
}: {
  label?: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  onSubmitEditing?: () => void;
  onBlur?: () => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600" }}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label ?? placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        multiline={multiline}
        onSubmitEditing={onSubmitEditing}
        onBlur={onBlur}
        returnKeyType={onSubmitEditing ? "done" : undefined}
        style={{
          color: c.text,
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: 1.5,
          borderRadius: 18,
          paddingHorizontal: 16,
          paddingVertical: 12,
          fontSize: 16,
          minHeight: multiline ? 80 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {hint ? <Text style={{ color: c.muted, fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

export function Card({ children, highlight, testID }: { children: ReactNode; highlight?: boolean; testID?: string }) {
  const c = useColors();
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: c.card,
        borderColor: highlight ? c.pink : c.border,
        borderWidth: highlight ? 2.5 : 1.5,
        borderRadius: 24,
        padding: 18,
        gap: 10,
      }}
    >
      {children}
    </View>
  );
}

/** Small secondary action in a row of actions. */
export function Chip({ label, onPress, disabled, selected, icon }: { label: string; onPress: () => void; disabled?: boolean; selected?: boolean; icon?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: selected ? c.pink : c.pinkSoft,
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 10,
        opacity: disabled ? 0.45 : 1,
        transform: squish(pressed),
      })}
    >
      <Text style={{ color: selected ? c.onPink : c.text, fontSize: 15, fontWeight: selected ? "700" : "400" }} numberOfLines={1}>
        {icon ? (
          <RNText aria-hidden accessibilityElementsHidden importantForAccessibility="no">
            {icon}{" "}
          </RNText>
        ) : null}
        {label}
      </Text>
    </Pressable>
  );
}
