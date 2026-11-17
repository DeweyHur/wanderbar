import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, useColors } from "./ui";

export type BarItem = {
  key: string;
  /** Short label under the icon. */
  label: string;
  /** Spoken label (and what tests click); defaults to the short label. */
  a11y?: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  selected?: boolean;
  badge?: number;
  onPress: () => void;
};

/** The tab bar along the bottom of a group's home: the module's sections, then More. */
export function BottomBar({ items }: { items: BarItem[] }) {
  const c = useColors();
  const inset = useSafeAreaInsets();
  return (
    <View
      testID="bottom-bar"
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: c.card,
        borderTopWidth: 1,
        borderTopColor: c.border,
        paddingTop: 6,
        paddingBottom: Math.max(inset.bottom, 8),
      }}
    >
      {items.map((it) => {
        const color = it.selected ? c.accent : c.muted;
        return (
          <Pressable
            key={it.key}
            testID={`bar-${it.key}`}
            accessibilityRole="button"
            accessibilityLabel={it.a11y ?? it.label}
            accessibilityState={{ selected: !!it.selected }}
            onPress={it.onPress}
            style={({ pressed }) => ({ flex: 1, alignItems: "center", gap: 2, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}
          >
            <View>
              <Ionicons name={it.icon} size={24} color={color} />
              {it.badge ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -10,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    paddingHorizontal: 4,
                    backgroundColor: c.danger,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{it.badge > 99 ? "99+" : it.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: it.selected ? "700" : "500" }}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
