import type { Stage } from "@wanderbar/route";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, View } from "react-native";
import { Body, Button, Chip, ErrorText, Loading, Text, useColors } from "@/components/ui";
import { apiImage } from "@/core/api";
import { errorText } from "@/core/errors";
import { prefs } from "@/core/platform/prefs";
import { reApi, type PropertySummary } from "./api";
import { factsLine, StageBadge } from "./parts";

type Filter = "all" | "toSee" | "seen" | "out";
const FILTERS: Filter[] = ["all", "toSee", "seen", "out"];
const IN: Record<Filter, (s: Stage) => boolean> = {
  all: () => true,
  toSee: (s) => s === "interested" || s === "to_tour",
  seen: (s) => s === "toured" || s === "considering" || s === "offered" || s === "contract",
  out: (s) => s === "rejected",
};
const FILTER_KEY = "realestate_filter";

/** A real-estate group's home: the houses we saved or saw, newest activity first. */
export function RealEstateHome({ groupId }: { groupId: string }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [list, setList] = useState<PropertySummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      prefs.get(FILTER_KEY).then((v) => FILTERS.includes(v as Filter) && setFilter(v as Filter));
      reApi.list(groupId).then(
        (l) => {
          setList(l);
          setError("");
        },
        (e) => setError(errorText(t, e)),
      );
    }, [groupId, t]),
  );
  const pick = (f: Filter) => {
    setFilter(f);
    prefs.set(FILTER_KEY, f);
  };

  if (!list) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  const shown = list.filter((p) => IN[filter](p.stage));
  return (
    <View style={{ gap: 12 }} testID="realestate-home">
      <Button label={`🏠 ${t("realestate:home.add")}`} onPress={() => router.push({ pathname: "/property/new", params: { groupId } })} />
      {list.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {FILTERS.map((f) => (
            <Chip key={f} label={`${t(`realestate:home.${f}`)} ${list.filter((p) => IN[f](p.stage)).length}`} selected={filter === f} onPress={() => pick(f)} />
          ))}
        </View>
      )}
      {list.length === 0 && <Body muted>{t("realestate:home.empty")}</Body>}
      {shown.map((p) => (
        <Pressable
          key={p.id}
          testID="property-card"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/property/[id]", params: { id: p.id } })}
          style={({ pressed }) => ({
            flexDirection: "row",
            gap: 12,
            backgroundColor: c.card,
            borderColor: c.border,
            borderWidth: 1.5,
            borderRadius: 20,
            padding: 12,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          {p.coverUrl ? (
            <Image source={apiImage(p.coverUrl)} style={{ width: 84, height: 84, borderRadius: 14, backgroundColor: c.pinkSoft }} resizeMode="cover" />
          ) : (
            <View style={{ width: 84, height: 84, borderRadius: 14, backgroundColor: c.pinkSoft, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 32 }}>🏠</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "700" }} numberOfLines={2}>
              {p.address}
            </Text>
            {factsLine(t, i18n.language, p) ? (
              <Text style={{ color: c.muted, fontSize: 14 }} numberOfLines={1}>
                {factsLine(t, i18n.language, p)}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <StageBadge stage={p.stage} />
              {p.myOverall != null && <Text style={{ color: c.accent, fontWeight: "700", fontSize: 14 }}>{t("realestate:home.mine", { score: p.myOverall })}</Text>}
              {p.avgOverall != null && p.tours > 1 && <Text style={{ color: c.muted, fontSize: 14 }}>{t("realestate:home.avg", { score: p.avgOverall })}</Text>}
              {p.tours > 0 && <Text style={{ color: c.muted, fontSize: 13 }}>{t("realestate:home.toursCount", { count: p.tours })}</Text>}
              {p.openHouse && (p.stage === "interested" || p.stage === "to_tour") ? <Text style={{ color: c.muted, fontSize: 13 }}>🕐 {p.openHouse}</Text> : null}
            </View>
          </View>
        </Pressable>
      ))}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}
