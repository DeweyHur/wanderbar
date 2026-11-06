import { FOOD_CATEGORIES } from "@wanderbar/route";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Chip, useColors, Text } from "@/components/ui";

/** Pick one category (tap again to clear). */
export function CategoryPicker({ value, onChange, label }: { value: string | null; onChange: (c: string | null) => void; label?: string }) {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600" }}>{label}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {FOOD_CATEGORIES.map((k) => (
          <Chip key={k} label={t(`food:category.${k}`)} selected={value === k} onPress={() => onChange(value === k ? null : k)} />
        ))}
      </View>
    </View>
  );
}
