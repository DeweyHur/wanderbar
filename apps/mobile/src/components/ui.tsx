import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  View,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

/**
 * The look: baby pink and soft. Blush paper, pink pills, cocoa ink, round fonts
 * (Jua for headings and buttons, Gowun Dodum for reading). Light only: the pastel palette is the brand.
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
export function useColors() {
  return palette;
}

export const fonts = { heading: "Jua_400Regular", body: "GowunDodum_400Regular" };

/** Bold text uses the round display face (custom fonts can't be faux-bolded nicely on Android). */
function fontStyle(style: TextProps["style"]): TextStyle {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const w = flat.fontWeight;
  const heavy = w === "bold" || w === "600" || w === "700" || w === "800" || w === "900" || w === 600 || w === 700 || w === 800;
  return { fontFamily: heavy ? fonts.heading : fonts.body, fontWeight: "normal" };
}

/** Text in the app's fonts. Use instead of react-native's Text. */
export function Text(props: TextProps) {
  return <RNText {...props} style={[props.style, fontStyle(props.style)]} />;
}

export function TextInput(props: TextInputProps) {
  return <RNTextInput {...props} style={[props.style, { fontFamily: fonts.body }]} />;
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
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  kind?: "primary" | "plain";
  disabled?: boolean;
}) {
  const c = useColors();
  const primary = kind === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: c.pink } : { backgroundColor: c.card, borderColor: c.pink, borderWidth: 2 },
        { opacity: disabled ? 0.5 : 1, transform: squish(pressed) },
      ]}
    >
      {busy ? <ActivityIndicator color={c.onPink} /> : <Text style={[styles.buttonText, { color: c.onPink }]}>{label}</Text>}
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
}: {
  label?: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  onSubmitEditing?: () => void;
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
      <Text style={{ color: c.onPink, fontSize: 15, fontWeight: selected ? "700" : "400" }} numberOfLines={1}>
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
