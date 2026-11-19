import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { SignIn } from "@/components/SignIn";
import { Body, Button, Card, ErrorText, Field, Loading, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import { loadLastGroup } from "@/core/lastGroup";
import { useIncomingShare } from "@/core/platform/shareIntent";
import { useSession } from "@/core/session";
import { restaurantApi } from "@/modules/food/restaurants/api";
import { BeenChoice } from "@/modules/food/restaurants/BeenChoice";
import { routeApi, type PlanSummary } from "@/modules/food/route/api";
import { planLabel, today } from "@/modules/food/route/dates";
import { DayPicker } from "@/modules/food/route/DayPicker";
import { parseSharedPlace, type ParsedPlace } from "@wanderbar/route";
import { api } from "@/core/api";
import type { PlaceDetails } from "@/modules/food/route/google";
import { FormScroll } from "@/components/FormScroll";

/**
 * Where shares from Yelp / Google Maps land (and the paste screen on the web).
 * Save the place as one of the group's restaurants, or put it straight into a day route.
 */
export default function ShareScreen() {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const incoming = useIncomingShare();
  const [raw, setRaw] = useState("");
  const [place, setPlace] = useState<ParsedPlace | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [routes, setRoutes] = useState(false);
  const [pickingDay, setPickingDay] = useState(false);
  const [visitedOn, setVisitedOn] = useState<string | null>(null);
  /** What the shared Google Maps link points at: fills the address and gives routes the exact spot. */
  const [found, setFound] = useState<PlaceDetails | null>(null);
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    if (incoming.share) {
      setRaw(incoming.share.text);
      setPlace(parseSharedPlace(incoming.share.text, incoming.share.title));
    }
  }, [incoming.share?.text, incoming.share?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // A Google Maps share is just a name and a short link: look the place up so the address fills in.
  const gmapsUrl = place?.source === "gmaps" ? place.mapsUrl : "";
  const signedIn = state.status === "signedIn";
  useEffect(() => {
    setFound(null);
    // Only when the share came without an address (a typed or pasted one is kept as is).
    if (!gmapsUrl || !signedIn || place?.address.trim()) return;
    let live = true;
    setLooking(true);
    api<{ place: PlaceDetails | null }>("/api/places/from-link", { body: { url: gmapsUrl, name: place?.name ?? "" } })
      .then(({ place: d }) => {
        if (!live || !d) return;
        setFound(d);
        setPlace((p) => (p ? { ...p, name: p.name.trim() || d.name, address: p.address.trim() || d.address } : p));
      })
      .catch(() => {})
      .finally(() => live && setLooking(false));
    return () => {
      live = false;
    };
  }, [gmapsUrl, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = state.status === "signedIn" ? state.groups : null;
  useEffect(() => {
    if (!groups?.length) return;
    loadLastGroup().then((last) => {
      const gid = last && groups.some((g) => g.id === last) ? last : groups[0].id;
      setGroupId(gid);
      routeApi.list(gid).then(setPlans).catch((e) => setError(errorText(t, e)));
    });
  }, [groups, t]);

  if (state.status === "loading") return <Loading />;
  if (state.status === "signedOut") return <SignIn />;

  const onPaste = (v: string) => {
    setRaw(v);
    setPlace(v.trim() ? parseSharedPlace(v) : null);
  };

  const addTo = async (planId: string | null, date?: string) => {
    if (!place?.name.trim() || !groupId) return;
    setBusy(planId ?? "new");
    setError("");
    try {
      const id =
        planId ??
        (
          await routeApi.create(groupId, { date: date ?? today() })
        ).id;
      const exact = found && place.address === found.address ? { lat: found.lat, lng: found.lng, googlePlaceId: found.googlePlaceId, hoursRaw: found.hoursRaw } : {};
      await routeApi.addStops(id, [{ name: place.name.trim(), address: place.address, mapsUrl: place.mapsUrl, yelpUrl: place.yelpUrl, ...exact }]);
      incoming.clear();
      router.replace({ pathname: "/plan/[id]", params: { id } });
    } catch (e) {
      setError(errorText(t, e));
      setBusy(null);
    }
  };

  const saveRestaurant = async () => {
    if (!place?.name.trim() || !groupId) return;
    setBusy("restaurant");
    setError("");
    try {
      const { restaurant, created } = await restaurantApi.create(groupId, {
        name: place.name.trim(),
        address: place.address,
        mapsUrl: place.mapsUrl,
        yelpUrl: place.yelpUrl,
        // Already found from the link: saved as that exact place, no second search.
        ...(found && place.address === found.address ? { googlePlaceId: found.googlePlaceId } : {}),
        ...(visitedOn ? { visitedOn } : {}),
      });
      incoming.clear();
      router.replace({ pathname: "/restaurant/[id]", params: { id: restaurant.id, ...(created ? {} : { existing: "1" }) } });
    } catch (e) {
      setError(errorText(t, e));
      setBusy(null);
    }
  };

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t("food:share.title") }} />
      {!incoming.share && (
        <Field label={t("food:share.paste")} value={raw} onChangeText={onPaste} hint={t("food:share.pasteHint")} multiline />
      )}
      {place && (
        <Card>
          <Body muted>{t(`food:share.from.${place.source}`)}</Body>
          <Field label={t("food:stop.name")} value={place.name} onChangeText={(name) => setPlace({ ...place, name })} />
          <Field
            label={t("food:stop.address")}
            value={place.address}
            onChangeText={(address) => setPlace({ ...place, address })}
            placeholder={looking ? t("food:share.findingAddress") : undefined}
          />
          <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
            {place.yelpUrl || place.mapsUrl}
          </Text>
        </Card>
      )}
      {place && groupId && (
        <View style={{ gap: 6 }}>
          <BeenChoice value={visitedOn} onChange={setVisitedOn} />
          <Button label={t("food:restaurant.saveRestaurant")} busy={busy === "restaurant"} disabled={!!busy || !place.name.trim()} onPress={saveRestaurant} />
          <Body muted>{t("food:restaurant.saveRestaurantHint")}</Body>
        </View>
      )}
      {place && groupId && plans && !routes && (
        <Button kind="plain" label={t("food:share.addTo")} disabled={!!busy || !place.name.trim()} onPress={() => setRoutes(true)} />
      )}
      {place && groupId && plans && routes && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }}>{t("food:share.addTo")}</Text>
          {plans.filter((p) => !p.date || p.date >= today()).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).map((p) => (
            <Pressable key={p.id} disabled={!!busy || !place.name.trim()} onPress={() => addTo(p.id)}>
              <Card>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: "600" }}>{planLabel(t, i18n.language, p)}</Text>
                <Body muted>{t("food:route.progress", { finished: p.finished, total: p.total })}</Body>
              </Card>
            </Pressable>
          ))}
          <Button kind="plain" label={t("food:share.newRoute")} busy={busy === "new"} disabled={!place.name.trim()} onPress={() => setPickingDay(true)} />
          <DayPicker visible={pickingDay} onPick={(date) => addTo(null, date)} onClose={() => setPickingDay(false)} />
        </View>
      )}
      {groups && groups.length === 0 && <Body muted>{t("food:share.noGroup")}</Body>}
      <ErrorText>{error}</ErrorText>
    </FormScroll>
  );
}
