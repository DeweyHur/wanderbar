import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useColors, Text } from "@/components/ui";
import type { RatingSummary } from "./api";

const GOLD = "#F5A524";

/** One star, filled 0, half or whole. */
function Star({ fill, size }: { fill: 0 | 0.5 | 1; size: number }) {
  const c = useColors();
  return (
    <View style={{ width: size, height: size * 1.2 }}>
      <Text style={{ position: "absolute", fontSize: size, lineHeight: size * 1.2, color: c.border }}>★</Text>
      {fill > 0 && (
        <View style={{ position: "absolute", width: fill === 1 ? size : size / 2, height: size * 1.2, overflow: "hidden" }}>
          <Text style={{ fontSize: size, lineHeight: size * 1.2, color: GOLD }}>★</Text>
        </View>
      )}
    </View>
  );
}

const fillFor = (value: number, i: number): 0 | 0.5 | 1 => (value >= i + 1 ? 1 : value >= i + 0.5 ? 0.5 : 0);

/** Read-only stars, e.g. ★★★★½ */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row" }} accessible accessibilityLabel={`${value}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fill={fillFor(value, i)} size={size} />
      ))}
    </View>
  );
}

/** "★ 4.5 (3)" — compact group average; nothing when nobody has rated yet. */
export function RatingBadge({ rating }: { rating: RatingSummary }) {
  const c = useColors();
  if (rating.avg == null) return null;
  return (
    <Text style={{ color: c.text, fontSize: 14 }}>
      <Text style={{ color: GOLD }}>★</Text> {rating.avg.toFixed(1)} <Text style={{ color: c.muted }}>({rating.count})</Text>
    </Text>
  );
}

/** Tap the left half of a star for a half star, the right half for a whole one. */
export function StarInput({ value, onChange, size = 40 }: { value: number; onChange: (v: number) => void; size?: number }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ width: size, height: size * 1.2 }}>
          <Star fill={fillFor(value, i)} size={size} />
          <View style={{ position: "absolute", flexDirection: "row", width: size, height: size * 1.2 }}>
            {[i + 0.5, i + 1].map((v) => (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityLabel={t("food:rating.setStars", { count: v })}
                onPress={() => onChange(v)}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
