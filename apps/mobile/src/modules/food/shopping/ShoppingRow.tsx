import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useColors, Text } from "@/components/ui";
import { dayLabel } from "../route/dates";
import type { ShoppingItem } from "./api";

/** One thing to buy: tap the circle to check it off. Shows what it's for (a meal or a dish) when it's for something. */
export function ShoppingRow({ item, onToggle, onRemove, showFor = true }: { item: ShoppingItem; onToggle: () => void; onRemove: () => void; showFor?: boolean }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const forWhat = !showFor
    ? null
    : item.meal
      ? [item.meal.date ? dayLabel(t, i18n.language, item.meal.date) : null, t(`food:meal.${item.meal.slot}`), item.dishName].filter(Boolean).join(" · ")
      : item.dishName;
  return (
    <View testID="shopping-row" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done }}
        aria-checked={item.done}
        accessibilityLabel={item.name}
        hitSlop={8}
        onPress={onToggle}
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 2.5,
          borderColor: item.done ? c.ok : c.pink,
          backgroundColor: item.done ? c.ok : c.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {item.done ? <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>✓</Text> : null}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ color: item.done ? c.muted : c.text, fontSize: 16, textDecorationLine: item.done ? "line-through" : "none" }}>
          {item.name}
          {item.qty ? <Text style={{ color: c.muted }}>{`  ${item.qty}`}</Text> : null}
        </Text>
        {forWhat ? (
          <Text testID="shopping-for" style={{ color: c.accent, fontSize: 12 }} numberOfLines={1}>
            {t("food:shopping.for", { what: forWhat })}
          </Text>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("food:shopping.remove", { name: item.name })} hitSlop={8} onPress={onRemove}>
        <Text style={{ color: c.muted, fontSize: 18, paddingHorizontal: 6 }}>×</Text>
      </Pressable>
    </View>
  );
}
