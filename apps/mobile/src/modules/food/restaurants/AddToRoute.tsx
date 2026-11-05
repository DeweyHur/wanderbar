import { router } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { Body, Button, Card, ErrorText, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { routeApi, type PlanSummary } from "../route/api";
import { planLabel, today } from "../route/dates";
import { DayPicker } from "../route/DayPicker";
import type { Restaurant } from "./api";

/** Pick one of my routes in this group (or start a new one) and put the restaurant at its end. */
export function AddToRoute({ restaurant }: { restaurant: Restaurant }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    routeApi.list(restaurant.groupId).then(setPlans).catch((e) => setError(errorText(t, e)));
  }, [restaurant.groupId, t]);

  const add = async (planId: string | null, date?: string) => {
    setBusy(planId ?? "new");
    setError("");
    try {
      const id = planId ?? (await routeApi.create(restaurant.groupId, { date: date ?? today() })).id;
      await routeApi.addStops(id, [
        {
          name: restaurant.name,
          address: restaurant.address,
          mapsUrl: restaurant.mapsUrl,
          yelpUrl: restaurant.yelpUrl,
          hoursRaw: restaurant.hoursRaw,
          lat: restaurant.lat,
          lng: restaurant.lng,
          googlePlaceId: restaurant.googlePlaceId,
          itemId: restaurant.id,
        },
      ]);
      router.push({ pathname: "/plan/[id]", params: { id } });
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 8 }} testID="add-to-route">
      <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }}>{t("food:share.addTo")}</Text>
      {plans?.filter((p) => !p.date || p.date >= today()).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).map((p) => (
        <Pressable key={p.id} accessibilityRole="button" disabled={!!busy} onPress={() => add(p.id)}>
          <Card>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "600" }}>{planLabel(t, i18n.language, p)}</Text>
            <Body muted>{t("food:route.progress", { finished: p.finished, total: p.total })}</Body>
          </Card>
        </Pressable>
      ))}
      <Button kind="plain" label={t("food:share.newRoute")} busy={busy === "new"} onPress={() => setPicking(true)} />
      <DayPicker visible={picking} onPick={(date) => add(null, date)} onClose={() => setPicking(false)} />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}
