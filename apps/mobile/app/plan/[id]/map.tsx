import { Links, placeQuery, formatDistance } from "@wanderbar/route";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { planLabel } from "@/modules/food/route/dates";
import { Linking, ScrollView, Text, View } from "react-native";
import { Body, Button, ErrorText, Loading, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { routeApi, type Plan } from "@/modules/food/route/api";
import { formatDuration } from "@/modules/food/route/format";
import { RouteMap } from "@/modules/food/route/RouteMap";
import { useRoute } from "@/modules/food/route/useRoute";

/** Google Maps directions through every remaining stop (origin = first, destination = last). */
function googleRouteUrl(plan: Plan) {
  const stops = plan.stops.filter((s) => s.status !== "skipped" && s.status !== "done");
  if (!stops.length) return null;
  if (stops.length === 1) return Links.googleDirections(stops[0].name, stops[0].address);
  const q = (s: (typeof stops)[number]) => encodeURIComponent(s.lat != null ? `${s.lat},${s.lng}` : placeQuery(s.name, s.address));
  const mid = stops.slice(1, -1).map(q).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${q(stops[0])}&destination=${q(stops[stops.length - 1])}${mid ? `&waypoints=${mid}` : ""}&travelmode=driving`;
}

export default function PlanMap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    routeApi.get(id).then(setPlan).catch((e) => setError(errorText(t, e)));
  }, [id, t]);
  const route = useRoute(plan?.stops ?? []);
  if (!plan) return error ? <View style={{ padding: 20 }}><ErrorText>{error}</ErrorText></View> : <Loading />;

  const url = googleRouteUrl(plan);
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: planLabel(t, i18n.language, plan) }} />
      {route.points.length ? <RouteMap stops={plan.stops} route={route.result} /> : <Body muted>{t("food:route.mapNoPlaces")}</Body>}
      {route.result && (
        <Text style={{ color: c.text, fontSize: 16, fontWeight: "600" }}>
          {t("food:route.driveTotal", { time: formatDuration(t, route.result.seconds), distance: formatDistance(route.result.meters) })}
        </Text>
      )}
      {route.points.slice(1).map((s, i) => {
        const leg = route.result?.legs[i];
        return (
          <Body key={s.id} muted={s.status === "done"}>
            {`${route.points[i].name} → ${s.name}${leg ? ` · ${formatDuration(t, leg.seconds)} · ${formatDistance(leg.meters)}` : ""}`}
          </Body>
        );
      })}
      {url && <Button kind="plain" label={t("food:route.openInGoogleMaps")} onPress={() => Linking.openURL(url)} />}
    </ScrollView>
  );
}
