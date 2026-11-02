import { router } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { Body, Button, Card, Chip, Field, useColors } from "@/components/ui";
import { HoursBadge } from "../route/HoursBadge";
import { useNow } from "../route/hooks";
import type { RestaurantSummary } from "./api";

/** The group's saved restaurants: search by name or address, filter by category. */
export function RestaurantList({ groupId, restaurants }: { groupId: string; restaurants: RestaurantSummary[] }) {
  const { t } = useTranslation();
  const c = useColors();
  const now = useNow();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const present = useMemo(() => [...new Set(restaurants.map((r) => r.category).filter((x): x is string => !!x))], [restaurants]);
  // The filter only applies while its chips are on screen (a deleted last match must not leave a hidden filter).
  const active = present.length > 1 && category && present.includes(category) ? category : null;
  const shown = restaurants.filter((r) => {
    const s = q.trim().toLowerCase();
    if (s && !r.name.toLowerCase().includes(s) && !r.address.toLowerCase().includes(s)) return false;
    return !active || r.category === active;
  });

  return (
    <View style={{ gap: 12 }}>
      {restaurants.length > 0 && <Field value={q} onChangeText={setQ} placeholder={t("food:restaurant.searchSaved")} />}
      {present.length > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {present.map((k) => (
            <Chip key={k} label={t(`food:category.${k}`)} selected={active === k} onPress={() => setCategory(active === k ? null : k)} />
          ))}
        </View>
      )}
      {restaurants.length === 0 && <Body muted>{t("food:restaurant.empty")}</Body>}
      {shown.map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          accessibilityLabel={r.name}
          onPress={() => router.push({ pathname: "/restaurant/[id]", params: { id: r.id } })}
        >
          <Card testID="restaurant-card">
            <Text style={{ color: c.text, fontSize: 17, fontWeight: "600" }} numberOfLines={1}>
              {r.name}
            </Text>
            <Body muted>
              {[r.category ? t(`food:category.${r.category}`) : null, r.menuCount ? t("food:restaurant.menuCount", { count: r.menuCount }) : null]
                .filter(Boolean)
                .join(" · ") || r.address}
            </Body>
            {r.category || r.menuCount ? (
              r.address ? (
                <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
                  {r.address}
                </Text>
              ) : null
            ) : null}
            <HoursBadge hoursRaw={r.hoursRaw} now={now} />
          </Card>
        </Pressable>
      ))}
      <Button label={t("food:restaurant.add")} onPress={() => router.push({ pathname: "/restaurant/new", params: { groupId } })} />
    </View>
  );
}
