import { Links, formatDistance, formatPlaceDistance, metersBetween, nearestKnown, placeQuery } from "@wanderbar/route";
import { getLocales } from "expo-localization";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { planLabel } from "@/modules/food/route/dates";
import { Linking, ScrollView, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Loading, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import { routeApi, type Plan, type Stop } from "@/modules/food/route/api";
import { formatDuration } from "@/modules/food/route/format";
import { knownPlaces, type KnownPlace } from "@/modules/food/route/google";
import type { MapMark } from "@/modules/food/route/mapMarks";
import { RouteMap } from "@/modules/food/route/RouteMap";
import { useRoute } from "@/modules/food/route/useRoute";
import { carless } from "@/modules/food/trips/api";

/** Google Maps directions through every remaining stop (origin = first, destination = last). */
function googleRouteUrl(plan: Plan) {
  const stops = plan.stops.filter((s) => s.status !== "skipped" && s.status !== "done");
  if (!stops.length) return null;
  if (stops.length === 1) return Links.googleDirections(stops[0].name, stops[0].address);
  const q = (s: (typeof stops)[number]) => encodeURIComponent(s.lat != null ? `${s.lat},${s.lng}` : placeQuery(s.name, s.address));
  const mid = stops.slice(1, -1).map(q).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${q(stops[0])}&destination=${q(stops[stops.length - 1])}${mid ? `&waypoints=${mid}` : ""}&travelmode=driving`;
}

const stopKey = (s: Pick<Stop, "googlePlaceId" | "name" | "address">) => s.googlePlaceId || `${s.name.trim().toLowerCase()}|${s.address.trim().toLowerCase()}`;
type Hotel = NonNullable<Plan["endHotel"]>;
type Picked = { kind: "stop"; stop: Stop; n: number } | { kind: "hotel"; hotel: Hotel } | { kind: "place"; place: KnownPlace };

/**
 * The day on a map: the route's stops and hotels, plus the group's places nearby (saved restaurants, places on
 * other routes) to pick from. Tap a pin to open it in Google Maps or Yelp, or to put it on / take it off the route.
 */
export default function PlanMap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [known, setKnown] = useState<KnownPlace[]>([]);
  const [showPlaces, setShowPlaces] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    routeApi.get(id).then(setPlan).catch((e) => setError(errorText(t, e)));
  }, [id, t]);
  useEffect(() => {
    if (plan?.groupId) knownPlaces(plan.groupId).then(setKnown, () => {});
  }, [plan?.groupId]);
  const route = useRoute(plan?.stops ?? []);
  const inMiles = getLocales()[0]?.regionCode === "US";

  // Where "nearby" is measured from: tonight's (or this morning's) hotel, else the middle of the route.
  const located = (plan?.stops ?? []).filter((s) => s.lat != null && s.lng != null);
  const hotels = [plan?.startHotel, plan?.endHotel].filter((h, i, all): h is Hotel => !!h && h.lat != null && h.lng != null && all.findIndex((x) => x?.id === h.id) === i);
  const stay = plan?.endHotel?.lat != null ? plan.endHotel : plan?.startHotel?.lat != null ? plan.startHotel : null;
  const origin = stay
    ? { lat: stay.lat!, lng: stay.lng! }
    : located.length
      ? { lat: located.reduce((a, s) => a + s.lat!, 0) / located.length, lng: located.reduce((a, s) => a + s.lng!, 0) / located.length }
      : null;

  const nearby = useMemo(() => {
    if (!plan || !origin) return [];
    const skip = new Set(plan.stops.map(stopKey));
    for (const h of hotels) skip.add(stopKey({ googlePlaceId: h.googlePlaceId ?? "", name: h.name, address: h.address ?? "" }));
    return nearestKnown(known, origin, skip, 40, 60_000);
  }, [plan, known, origin?.lat, origin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const marks: MapMark[] = useMemo(() => {
    if (!plan) return [];
    const out: MapMark[] = [];
    plan.stops.forEach((s, i) => {
      if (s.lat != null && s.lng != null) out.push({ key: `stop:${s.id}`, lat: s.lat, lng: s.lng, title: s.name, kind: "stop", n: i + 1, status: s.status });
    });
    for (const h of hotels) out.push({ key: `hotel:${h.id}`, lat: h.lat!, lng: h.lng!, title: h.name, kind: "hotel" });
    if (showPlaces) for (const p of nearby) out.push({ key: `place:${p.key}`, lat: p.lat, lng: p.lng, title: p.name, kind: "place" });
    return out;
  }, [plan, nearby, showPlaces]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan) return error ? <View style={{ padding: 20 }}><ErrorText>{error}</ErrorText></View> : <Loading />;

  const picked: Picked | null = (() => {
    if (!selected) return null;
    const [kind, key] = [selected.slice(0, selected.indexOf(":")), selected.slice(selected.indexOf(":") + 1)];
    if (kind === "stop") {
      const i = plan.stops.findIndex((s) => s.id === key);
      return i >= 0 ? { kind, stop: plan.stops[i], n: i + 1 } : null;
    }
    if (kind === "hotel") {
      const h = hotels.find((x) => x.id === key);
      return h ? { kind, hotel: h } : null;
    }
    const p = nearby.find((x) => x.key === key);
    return p ? { kind: "place", place: p } : null;
  })();

  const act = async (fn: () => Promise<Stop[]>) => {
    setBusy(true);
    setError("");
    try {
      const stops = await fn();
      setPlan((p) => (p ? { ...p, stops } : p));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  const addPlace = (p: KnownPlace) =>
    act(async () => {
      const stops = await routeApi.addStops(plan.id, [
        { name: p.name, address: p.address, lat: p.lat, lng: p.lng, googlePlaceId: p.googlePlaceId, mapsUrl: p.mapsUrl, yelpUrl: p.yelpUrl ?? "", hoursRaw: p.hoursRaw, itemId: p.itemId ?? undefined },
      ]);
      // Keep the new stop selected, now as a numbered pin.
      const added = [...stops].reverse().find((s) => stopKey(s) === p.key || (s.name === p.name && s.address === p.address));
      setSelected(added ? `stop:${added.id}` : null);
      return stops;
    });
  // The hotel can go on the route as often as needed (check in, then out again, back at night).
  const addHotel = (h: Hotel) =>
    act(() => routeApi.addStops(plan.id, [{ name: h.name, address: h.address ?? "", lat: h.lat, lng: h.lng, googlePlaceId: h.googlePlaceId ?? "", mapsUrl: h.mapsUrl ?? "" }]));
  const removeStop = (s: Stop) => act(() => routeApi.deleteStop(s.id)).then(() => setSelected(null));

  const mode = plan.trip && carless(plan.trip) ? "transit" : "driving";
  const url = googleRouteUrl(plan);
  const place = picked?.kind === "stop" ? picked.stop : picked?.kind === "hotel" ? picked.hotel : picked?.place ?? null;
  // How far from where you're staying (only on a trip day with a hotel).
  const away = place && stay && picked?.kind !== "hotel" && place.lat != null && place.lng != null ? metersBetween({ lat: stay.lat!, lng: stay.lng! }, { lat: place.lat, lng: place.lng }) : null;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: planLabel(t, i18n.language, plan) }} />
      {nearby.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <Chip
            icon="★"
            label={t("food:route.mapPlaces", { count: nearby.length })}
            selected={showPlaces}
            onPress={() => {
              setShowPlaces((v) => !v);
              if (picked?.kind === "place") setSelected(null);
            }}
          />
          <Body muted>{t("food:route.mapHint")}</Body>
        </View>
      )}
      {marks.length ? (
        <RouteMap marks={marks} route={route.result} selected={selected} onSelect={setSelected} />
      ) : (
        <Body muted>{t("food:route.mapNoPlaces")}</Body>
      )}

      {picked && place && (
        <Card highlight testID="map-selected">
          <Text style={{ color: c.accent, fontSize: 13, fontWeight: "700" }}>
            {picked.kind === "stop"
              ? t("food:route.stopNumber", { n: picked.n })
              : picked.kind === "hotel"
                ? `🏨 ${t("food:route.mapHotel")}`
                : `★ ${picked.place.source === "saved" ? t("food:trip.savedPlace") : picked.place.source === "planned" ? t("food:trip.onRoutes") : t("food:route.beenThere", { date: picked.place.last.slice(5).replace("-", "/"), count: picked.place.times })}`}
          </Text>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>{place.name}</Text>
          {place.address ? <Body muted>{place.address}</Body> : null}
          {away != null && stay && <Body muted>{t("food:route.mapFromHotel", { distance: formatPlaceDistance(away, inMiles), place: stay.name })}</Body>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {picked.kind === "place" && <Button label={t("food:route.addToRoute")} busy={busy} onPress={() => addPlace(picked.place)} />}
            {picked.kind === "hotel" && <Button label={t("food:trip.stopBy", { name: picked.hotel.name })} busy={busy} onPress={() => addHotel(picked.hotel)} />}
            <Chip label="Google Maps" onPress={() => Linking.openURL(Links.googlePlace(place.name, place.address, place.googlePlaceId || null, "mapsUrl" in place ? place.mapsUrl : null))} />
            {picked.kind !== "hotel" && (
              <Chip label="Yelp" onPress={() => Linking.openURL(Links.yelpPlace(place.name, place.address, "yelpUrl" in place ? place.yelpUrl : null))} />
            )}
            <Chip label={t("food:route.directions")} onPress={() => Linking.openURL(Links.googleDirections(place.name, place.address, place.googlePlaceId || null, mode))} />
            {picked.kind === "stop" && <Chip label={t("food:route.removeFromRoute")} onPress={() => removeStop(picked.stop)} />}
          </View>
        </Card>
      )}
      <ErrorText>{error}</ErrorText>

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
