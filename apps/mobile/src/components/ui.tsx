import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

export function useColors() {
  const dark = useColorScheme() === "dark";
  return dark
    ? { bg: "#111214", card: "#1C1D21", text: "#F2F2F3", muted: "#9A9BA1", accent: "#FF7A45", danger: "#FF6B6B", border: "#2C2D32" }
    : { bg: "#F7F6F3", card: "#FFFFFF", text: "#16171A", muted: "#6B6C72", accent: "#E8590C", danger: "#D63B3B", border: "#E4E2DD" };
}

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
        primary ? { backgroundColor: c.accent } : { borderColor: c.border, borderWidth: 1 },
        { opacity: pressed || disabled ? 0.6 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? "#fff" : c.text} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? "#fff" : c.text }]}>{label}</Text>
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
  title: { fontSize: 26, fontWeight: "700", marginTop: 12 },
  body: { fontSize: 16, lineHeight: 23 },
  button: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonText: { fontSize: 17, fontWeight: "600" },
});
