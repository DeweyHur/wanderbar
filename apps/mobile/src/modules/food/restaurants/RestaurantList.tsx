import { router } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, View } from "react-native";
import { Body, Button, Card, Chip, Field, useColors, Text } from "@/components/ui";
import { apiImage } from "@/core/api";
import { parseTime } from "../route/dates";
import { HoursBadge } from "../route/HoursBadge";
import { useNow } from "../route/hooks";
import type { RestaurantSummary } from "./api";
import { allTags, TagChips } from "../../boardgame/parts";
import { RatingBadge } from "./Stars";

/** The group's saved restaurants: newest first (or by name); search by name, address or tag; filter by tag, category, been. */
export function RestaurantList({ groupId, restaurants }: { groupId: string; restaurants: RestaurantSummary[] }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const now = useNow();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [been, setBeen] = useState<"all" | "been" | "notYet">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [order, setOrder] = useState<"newest" | "name">("newest");
  const tagList = useMemo(() => allTags(restaurants), [restaurants]);
  const activeTag = tag && tagList.some((x) => x.toLowerCase() === tag.toLowerCase()) ? tag : null;

  const present = useMemo(() => [...new Set(restaurants.map((r) => r.category).filter((x): x is string => !!x))], [restaurants]);
  // The filter only applies while its chips are on screen (a deleted last match must not leave a hidden filter).
  const active = present.length > 1 && category && present.includes(category) ? category : null;
  const shown = restaurants
    .filter((r) => {
      // "#ramen" searches tags only; plain text matches the name, the address or a tag.
      const raw = q.trim().toLowerCase();
      const tagOnly = raw.startsWith("#");
      const s = raw.replace(/^#+/, "");
      const inTags = r.tags.some((x) => x.toLowerCase().includes(s));
      if (s && !(tagOnly ? inTags : r.name.toLowerCase().includes(s) || r.address.toLowerCase().includes(s) || inTags)) return false;
      if (activeTag && !r.tags.some((x) => x.toLowerCase() === activeTag.toLowerCase())) return false;
      if (been === "been" && !r.visitCount) return false;
      if (been === "notYet" && r.visitCount) return false;
      return !active || r.category === active;
    })
    .sort((a, b) => (order === "name" ? a.name.localeCompare(b.name, i18n.language) : b.createdAt.localeCompare(a.createdAt)));
  const beenCount = restaurants.filter((r) => r.visitCount).length;

  return (
    <View style={{ gap: 12 }}>
      {restaurants.length > 0 && <Field value={q} onChangeText={setQ} placeholder={t("food:restaurant.searchSaved")} />}
      {restaurants.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} testID="been-filter">
          <Chip label={t("food:been.all", { count: restaurants.length })} selected={been === "all"} onPress={() => setBeen("all")} />
          <Chip label={t("food:been.beenCount", { count: beenCount })} selected={been === "been"} onPress={() => setBeen("been")} />
          <Chip label={t("food:been.notYetCount", { count: restaurants.length - beenCount })} selected={been === "notYet"} onPress={() => setBeen("notYet")} />
        </View>
      )}
      {tagList.length > 0 && (
        <View testID="tag-filter">
          <TagChips tags={tagList} active={activeTag} onPick={setTag} allLabel={t("food:restaurant.allTags")} />
        </View>
      )}
      {restaurants.length > 1 && (
        <View style={{ flexDirection: "row", gap: 6 }} testID="restaurant-order">
          <Chip label={t("food:restaurant.newest")} selected={order === "newest"} onPress={() => setOrder("newest")} />
          <Chip label={t("food:restaurant.byName")} selected={order === "name"} onPress={() => setOrder("name")} />
        </View>
      )}
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
            <View style={{ flexDirection: "row", gap: 12 }}>
              {(r.coverPhotoId || r.hasPhoto) && (
                <Image source={apiImage(r.coverPhotoId ? `/api/photos/${r.coverPhotoId}?size=thumb` : `/api/restaurants/${r.id}/photo`)} style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: c.bg }} resizeMode="cover" />
              )}
              <View style={{ flex: 1, gap: 4 }}>
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
                {r.tags.length > 0 && (
                  <Text testID="restaurant-tags" style={{ color: c.accent, fontSize: 13 }} numberOfLines={1}>
                    {r.tags.map((x) => `#${x}`).join(" ")}
                  </Text>
                )}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                  <Text testID="been-badge" style={{ color: r.visitCount ? c.ok : c.muted, fontSize: 13, fontWeight: "700" }}>
                    {r.visitCount ? (r.visitedByMe ? t("food:been.badgeMe") : t("food:been.badgeGroup")) : t("food:been.badgeNotYet")}
                  </Text>
                  <RatingBadge rating={r.rating} />
                  <HoursBadge hoursRaw={r.hoursRaw} now={now} />
                  {parseTime(r.lastVisitedAt) && (
                    <Text style={{ color: c.muted, fontSize: 13 }}>
                      {t("food:visit.last", { date: new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(parseTime(r.lastVisitedAt)!) })}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
      <Button label={t("food:restaurant.add")} onPress={() => router.push({ pathname: "/restaurant/new", params: { groupId } })} />
    </View>
  );
}
