import { formatDistance, hoursStatusFromText, Links, parseSharedText } from "@wanderbar/route";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { HoursBadge } from "@/modules/food/route/HoursBadge";
import { routeApi, type Plan, type Stop } from "@/modules/food/route/api";
import { formatDuration } from "@/modules/food/route/format";
import { useGoogleAvailable, type PlaceDetails } from "@/modules/food/route/google";
import { PlaceSearch } from "@/modules/food/route/PlaceSearch";
import { useRoute } from "@/modules/food/route/useRoute";
import { useClock, useNow } from "@/modules/food/route/hooks";
import { ShareMenu } from "@/modules/food/route/ShareMenu";
import { dayLabel, planLabel, planPhase } from "@/modules/food/route/dates";
import { DayPicker } from "@/modules/food/route/DayPicker";
import { ArrivalPrompt } from "@/modules/food/route/ArrivalPrompt";
import { FixedLine } from "@/modules/food/route/FixedTime";
import { MealPlanner } from "@/modules/food/shopping/MealPlanner";
import { FormScroll } from "@/components/FormScroll";
import { carless, TRANSPORT_ICON } from "@/modules/food/trips/api";

/**
 * One day route, in one of three views:
 * - past: a record of where you went. Check off the places you went; tap one for its photos. No editing.
 * - today: the "now" card on top, then every stop in order (same flow as the old wanderbar app).
 * - future: planning. Add, reorder and remove stops; hours are for that day. Nothing is "current" yet.
 */
export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      routeApi
        .get(id)
        .then(setPlan)
        .catch((e) => setError(errorText(t, e)));
    }, [id, t]),
  );

  if (!plan) return error ? <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}><ErrorText>{error}</ErrorText></View> : <Loading />;
  const phase = planPhase(plan.date);
  // Keyed by phase: changing the day of a route moves it to the matching view with fresh state.
  if (phase === "past") return <PastPlan key="past" plan={plan} setPlan={setPlan} />;
  return <LivePlan key={phase} plan={plan} setPlan={setPlan} future={phase === "future"} />;
}

type ViewProps = { plan: Plan; setPlan: (fn: (p: Plan | null) => Plan | null) => void };

/** Title, day, trip and where the day starts: the same on every view (read-only on a past day). */
function PlanHeader({ plan, setPlan, onError, readOnly }: ViewProps & { onError: (e: unknown) => void; readOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [title, setTitle] = useState(plan.title);
  const [pickingDay, setPickingDay] = useState(false);
  const saveTitle = () => {
    const next = title.trim();
    if (next === plan.title) return;
    routeApi.update(plan.id, { title: next }).then((p) => setPlan((old) => (old ? { ...old, title: p.title } : old)), onError);
  };
  return (
    <>
      <Stack.Screen
        options={{
          title: planLabel(t, i18n.language, plan),
          headerRight: () => (
            <Pressable accessibilityRole="button" hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 6 }} onPress={() => router.push({ pathname: "/plan/[id]/map", params: { id: plan.id } })}>
              <Text style={{ color: c.accent, fontSize: 16 }}>{t("food:route.map")}</Text>
            </Pressable>
          ),
        }}
      />
      {!readOnly && (
        <Field label={t("food:route.name")} value={title} onChangeText={setTitle} placeholder={t("food:route.namePlaceholder")} onSubmitEditing={saveTitle} onBlur={saveTitle} />
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }} testID="plan-day">
        <Text style={{ color: c.text, fontSize: 16, fontWeight: "600" }}>{plan.date ? dayLabel(t, i18n.language, plan.date) : ""}</Text>
        {plan.trip ? (
          // A trip's day stays on its day: the trip screen changes the dates.
          <Chip icon={TRANSPORT_ICON[plan.trip.transport]} label={plan.trip.title || t("food:trip.untitled")} onPress={() => router.push({ pathname: "/trip/[id]", params: { id: plan.trip!.id } })} />
        ) : (
          <>
            <Chip label={t("food:date.change")} onPress={() => setPickingDay(true)} />
            {!readOnly && (
              <Chip
                label={t("food:meal.atHome")}
                icon="🏠"
                selected={plan.atHome}
                onPress={() => routeApi.update(plan.id, { atHome: !plan.atHome }).then((p) => setPlan((old) => (old ? { ...old, atHome: p.atHome } : old)), onError)}
              />
            )}
          </>
        )}
      </View>
      {plan.startHotel && !readOnly && (
        <View testID="start-hotel">
          <Body muted>{t("food:trip.startsAt", { name: plan.startHotel.name })}</Body>
        </View>
      )}
      {plan.atHome && !readOnly && <MealPlanner planId={plan.id} groupId={plan.groupId} />}
      <DayPicker
        visible={pickingDay}
        value={plan.date}
        onPick={(date) => routeApi.update(plan.id, { date }).then((p) => setPlan((old) => (old ? { ...old, date: p.date } : old)), onError)}
        onClose={() => setPickingDay(false)}
      />
    </>
  );
}

/** A row in the stop list: number, name, a line under it, and controls on the right. */
function StopRow({ index, name, highlight, dim, struck, lines, controls, onPress }: {
  index: number;
  name: string;
  highlight?: boolean;
  dim?: boolean;
  struck?: boolean;
  lines: ReactNode;
  controls: ReactNode;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable onPress={onPress}>
      <View
        testID={`stop-row-${index}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: highlight ? c.accent : c.border, backgroundColor: c.card, opacity: dim ? 0.5 : 1 }}
      >
        <Text style={{ color: c.muted, width: 22, textAlign: "right" }}>{index + 1}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: highlight ? "700" : "500", textDecorationLine: struck ? "line-through" : "none" }} numberOfLines={1}>
            {name}
          </Text>
          {lines}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>{controls}</View>
      </View>
    </Pressable>
  );
}

const openStop = (plan: Plan, s: Stop) => router.push({ pathname: "/plan/[id]/stop/[stopId]", params: { id: plan.id, stopId: s.id } });

/** This day's hotels, and whether a stop is one of them (stops at the hotel get 🏨). */
function useDayHotels(plan: Plan) {
  const dayHotels = [plan.startHotel, plan.endHotel].filter((h, i, all): h is NonNullable<typeof h> => !!h && all.findIndex((x) => x?.id === h.id) === i);
  const isHotelStop = (s: Stop) =>
    dayHotels.some((h) => (h.googlePlaceId && s.googlePlaceId === h.googlePlaceId) || (s.name.trim() === h.name.trim() && s.address.trim() === (h.address ?? "").trim()));
  return { dayHotels, isHotelStop };
}

function DeleteRoute({ plan, onError }: { plan: Plan; onError: (e: unknown) => void }) {
  const { t } = useTranslation();
  return (
    <Chip
      label={t("food:route.deleteRoute")}
      onPress={async () => {
        if (!(await confirm(t("food:route.confirmDeleteRoute"), t("common.delete"), t("common.cancel")))) return;
        await routeApi.remove(plan.id).then(() => router.back(), onError);
      }}
    />
  );
}

/** A day that's over: where you went. Check off the places you actually went; that's the whole record. */
function PastPlan({ plan, setPlan }: ViewProps) {
  const { t } = useTranslation();
  const c = useColors();
  const [error, setError] = useState("");
  const onError = (e: unknown) => setError(errorText(t, e));
  const { isHotelStop } = useDayHotels(plan);
  const went = plan.stops.filter((s) => s.status === "done").length;
  const toggle = (s: Stop) =>
    routeApi.flow(plan.id, { action: s.status === "done" ? "restore" : "complete", stopId: s.id }).then((stops) => setPlan((p) => (p ? { ...p, stops } : p)), onError);

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <PlanHeader plan={plan} setPlan={setPlan} onError={onError} readOnly />
      {plan.stops.length > 0 && (
        <Card testID="past-route">
          <Body>{t("food:route.pastDay", { done: went, count: plan.stops.length })}</Body>
          {went < plan.stops.length && <Body muted>{t("food:route.pastHint")}</Body>}
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
      {plan.stops.map((s, i) => {
        const done = s.status === "done";
        return (
          <StopRow
            key={s.id}
            index={i}
            name={isHotelStop(s) ? `🏨 ${s.name}` : s.name}
            dim={!done}
            onPress={() => openStop(plan, s)}
            lines={
              <>
                <Text style={{ color: done ? c.accent : c.muted, fontSize: 13 }}>{done ? t("food:route.visited") : t("food:route.notVisited")}</Text>
                <FixedLine stop={s} legSeconds={null} now={new Date()} mode="record" />
              </>
            }
            controls={
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={t("food:route.markVisited", { name: s.name })}
                hitSlop={8}
                onPress={() => toggle(s)}
                style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: done ? c.accent : c.border, backgroundColor: done ? c.accent : "transparent", alignItems: "center", justifyContent: "center" }}
              >
                {done ? <Text style={{ color: c.bg, fontSize: 16, fontWeight: "700" }}>✓</Text> : null}
              </Pressable>
            }
          />
        );
      })}
      {plan.endHotel && (
        <View testID="end-hotel">
          <Body muted>🏨 {t("food:trip.stayedAt", { name: plan.endHotel.name })}</Body>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        <DeleteRoute plan={plan} onError={onError} />
      </View>
    </FormScroll>
  );
}

/** Today (live: the current stop, done / skip, arrival prompts) or a future day (planning only). */
function LivePlan({ plan, setPlan, future }: ViewProps & { future: boolean }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const now = useNow();
  const clock = useClock();
  const googleAvailable = useGoogleAvailable();
  /** A restaurant stop just finished: offer to rate what was eaten there. */
  const [justAte, setJustAte] = useState<Stop | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quick, setQuick] = useState("");
  const [adding, setAdding] = useState(false);
  const route = useRoute(plan.stops);
  const onError = (e: unknown) => setError(errorText(t, e));

  const setStops = (stops: Stop[]) => setPlan((p) => (p ? { ...p, stops } : p));
  const run = async (fn: () => Promise<Stop[]>) => {
    setError("");
    setNotice("");
    try {
      setStops(await fn());
    } catch (e) {
      onError(e);
    }
  };
  const flow = (a: Parameters<typeof routeApi.flow>[1]) => run(() => routeApi.flow(plan.id, a));

  // A future day has nothing "current" yet: the server always keeps one, but it means nothing until that day.
  const current = future ? undefined : plan.stops.find((s) => s.status === "current");
  const done = async (s: Stop) => {
    await flow({ action: "complete", stopId: s.id });
    setJustAte(s.itemId ? s : null);
  };

  /** "카페, 공원, 재즈바" adds three; a pasted Google Maps share adds one place with its address and link. */
  const add = async () => {
    const text = quick.trim();
    if (!text) return;
    setAdding(true);
    const stops = /https?:\/\//.test(text)
      ? [(({ name, address, mapsUrl }) => ({ name: name || address || "📍", address, mapsUrl: mapsUrl ?? "" }))(parseSharedText(text))]
      : text.split(/[,，、\n]/).map((n) => ({ name: n.trim() })).filter((s) => s.name);
    await run(() => routeApi.addStops(plan.id, stops));
    setQuick("");
    setAdding(false);
  };

  /** Picked from Google search: name, address, hours, location and the Maps link in one go. */
  const addPicked = async (d: PlaceDetails) => {
    setQuick("");
    await run(() => routeApi.addStops(plan.id, [{ ...d, name: d.name || d.address }]));
  };
  const lastLocated = [...plan.stops].reverse().find((s) => s.lat != null && s.lng != null);
  const near = lastLocated ? { lat: lastLocated.lat!, lng: lastLocated.lng! } : null;
  // A trip day: searches start around where you're staying, and the day ends at that night's hotel.
  const stay = [plan.endHotel, plan.startHotel].find((h) => h?.lat != null && h?.lng != null) ?? null;
  const center = stay ? { lat: stay.lat!, lng: stay.lng!, label: stay.name } : null;
  const mode = plan.trip && carless(plan.trip) ? "transit" : "driving";
  // This day's hotels (where you woke up, where you sleep): you may stop by more than once (check in, drop
  // bags, come back later), so they're never hidden from search and each has a one-tap "stop by" button.
  const { dayHotels, isHotelStop } = useDayHotels(plan);
  const hotelKeys = new Set(dayHotels.flatMap((h) => [h.googlePlaceId, `${h.name.trim().toLowerCase()}|${(h.address ?? "").trim().toLowerCase()}`].filter(Boolean)));
  const stopByHotel = (h: (typeof dayHotels)[number]) =>
    run(() => routeApi.addStops(plan.id, [{ name: h.name, address: h.address ?? "", lat: h.lat, lng: h.lng, googlePlaceId: h.googlePlaceId ?? "", mapsUrl: h.mapsUrl ?? "" }]));

  // A future day: hours are shown for that day, and "closed now" warnings don't apply.
  const otherDay = future ? plan.date : null;
  const nextFixed = future ? undefined : plan.stops.find((s) => s.fixedAt && s.status !== "done" && s.status !== "skipped" && new Date(s.fixedAt).getTime() > clock.getTime() - 30 * 60_000);
  const closedNow = current && hoursStatusFromText(current.hoursRaw, now).kind === "closed";

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <PlanHeader plan={plan} setPlan={setPlan} onError={onError} />

      {future ? (
        <Card testID="future-route">
          <Body muted>{t("food:route.futureDay", { day: plan.date ? dayLabel(t, i18n.language, plan.date) : "" })}</Body>
        </Card>
      ) : (
        <>
          {plan.stops.length > 0 && <ArrivalPrompt plan={plan} onStops={setStops} />}
          {nextFixed && (
            // The next thing with a time you can't move: when to leave for it.
            <Card testID="fixed-next">
              <Pressable onPress={() => openStop(plan, nextFixed)}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: "700" }}>{nextFixed.name}</Text>
              </Pressable>
              <FixedLine stop={nextFixed} legSeconds={route.legTo.get(nextFixed.id)?.seconds} now={clock} mode="live" />
            </Card>
          )}
          {current ? (
            <Card highlight testID="current-card">
              <Text style={{ color: c.accent, fontSize: 13, fontWeight: "700" }}>{t("food:route.current")}</Text>
              <Pressable onPress={() => openStop(plan, current)}>
                <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{current.name}</Text>
                {current.address ? <Body muted>{current.address}</Body> : null}
              </Pressable>
              <HoursBadge hoursRaw={current.hoursRaw} now={now} day={null} />
              {closedNow && (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: c.danger }}>{t("food:route.closedWarning")}</Text>
                  <Chip label={t("food:route.next")} onPress={() => flow({ action: "postpone", stopId: current.id })} />
                </View>
              )}
              <ShareMenu place={current} onNotice={setNotice} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Chip label={t("food:route.done")} onPress={() => done(current)} />
                <Chip label={t("food:route.skip")} onPress={() => flow({ action: "postpone", stopId: current.id })} />
                <Chip label={t("food:route.directions")} onPress={() => Linking.openURL(Links.googleDirections(current.name, current.address, null, mode))} />
              </View>
            </Card>
          ) : plan.stops.length > 0 ? (
            <Card>
              <Body muted>{t("food:route.nothingCurrent")}</Body>
              <Chip label={t("food:route.restart")} onPress={() => flow({ action: "restart" })} />
            </Card>
          ) : null}
        </>
      )}

      {justAte?.itemId && (
        <Card testID="rate-prompt">
          <Body>{t("food:rating.prompt", { name: justAte.name })}</Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label={t("food:rating.rateNow")} onPress={() => router.push({ pathname: "/restaurant/[id]", params: { id: justAte.itemId! } })} />
            <Chip label={t("food:rating.later")} onPress={() => setJustAte(null)} />
          </View>
        </Card>
      )}

      {route.result && (
        <Body muted>
          {t("food:route.driveTotal", { time: formatDuration(t, route.result.seconds), distance: formatDistance(route.result.meters) })}
          {!future && route.remainingSeconds > 0 && route.remainingSeconds < route.result.seconds ? ` · ${t("food:route.remaining", { time: formatDuration(t, route.remainingSeconds) })}` : ""}
        </Body>
      )}
      {notice ? <Body muted>{notice}</Body> : null}
      <ErrorText>{error}</ErrorText>

      {plan.stops.map((s, i) => {
        // On a future day every stop is just planned: no done / skipped dimming, no current outline.
        const dim = !future && (s.status === "done" || s.status === "skipped");
        const leg = route.legTo.get(s.id);
        return (
          <StopRow
            key={s.id}
            index={i}
            name={isHotelStop(s) ? `🏨 ${s.name}` : s.name}
            highlight={!future && s.status === "current"}
            dim={dim}
            struck={!future && s.status === "skipped"}
            onPress={() => openStop(plan, s)}
            lines={
              <>
                {dim ? <Text style={{ color: c.muted, fontSize: 13 }}>{t(`food:route.status.${s.status}`)}</Text> : <HoursBadge hoursRaw={s.hoursRaw} now={now} day={otherDay} />}
                {!dim && leg && <Text style={{ color: c.muted, fontSize: 13 }}>{t("food:route.legFromPrev", { time: formatDuration(t, leg.seconds) })}</Text>}
                <FixedLine stop={s} legSeconds={leg?.seconds} now={clock} mode={future ? "plan" : "live"} />
              </>
            }
            controls={
              <>
                <Pressable accessibilityLabel={t("food:route.moveUp")} hitSlop={6} disabled={i === 0} onPress={() => flow({ action: "move", from: i, to: i - 1 })}>
                  <Text style={{ color: i === 0 ? c.border : c.muted, fontSize: 20, paddingHorizontal: 6 }}>▲</Text>
                </Pressable>
                <Pressable accessibilityLabel={t("food:route.moveDown")} hitSlop={6} disabled={i === plan.stops.length - 1} onPress={() => flow({ action: "move", from: i, to: i + 1 })}>
                  <Text style={{ color: i === plan.stops.length - 1 ? c.border : c.muted, fontSize: 20, paddingHorizontal: 6 }}>▼</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("food:route.removeStop", { name: s.name })}
                  hitSlop={6}
                  onPress={async () => {
                    if (!(await confirm(t("food:route.confirmRemoveStop", { name: s.name }), t("food:route.removeFromRoute"), t("common.cancel")))) return;
                    run(() => routeApi.deleteStop(s.id));
                  }}
                >
                  <Text style={{ color: c.muted, fontSize: 18, paddingHorizontal: 6, marginLeft: 4 }}>✕</Text>
                </Pressable>
              </>
            }
          />
        );
      })}

      {plan.endHotel && (
        // That night's hotel: always the last stop of the day.
        <Card testID="end-hotel">
          <Text style={{ color: c.accent, fontSize: 13, fontWeight: "700" }}>{t(future ? "food:trip.thatNight" : "food:trip.tonight")}</Text>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>🏨 {plan.endHotel.name}</Text>
          {plan.endHotel.address ? <Body muted>{plan.endHotel.address}</Body> : null}
          {!future && !current && plan.stops.length > 0 ? <ShareMenu place={plan.endHotel} onNotice={setNotice} /> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {future || current || plan.stops.length === 0 ? <ShareMenu kind="plain" place={plan.endHotel} onNotice={setNotice} /> : null}
            <Chip label={t("food:route.directions")} onPress={() => Linking.openURL(Links.googleDirections(plan.endHotel!.name, plan.endHotel!.address, plan.endHotel!.googlePlaceId || null, mode))} />
          </View>
        </Card>
      )}

      <PlaceSearch
        value={quick}
        onChangeText={setQuick}
        onPick={(d) => addPicked(d).catch(onError)}
        onSubmit={() => add()}
        near={near ?? center}
        around
        center={center}
        skip={plan.stops.map((s) => s.googlePlaceId || `${s.name.trim().toLowerCase()}|${s.address.trim().toLowerCase()}`).filter((k) => !hotelKeys.has(k))}
        visitedGroupId={plan.groupId}
        placeholder={googleAvailable ? t("food:route.searchPlaceholder") : t("food:route.addPlaceholder")}
      />
      <Button kind="plain" label={t("food:route.add")} busy={adding} disabled={!quick.trim()} onPress={add} />
      {dayHotels.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} testID="stop-by-hotel">
          {dayHotels.map((h) => (
            <Chip key={h.id} icon="🏨" label={t("food:trip.stopBy", { name: h.name })} onPress={() => stopByHotel(h)} />
          ))}
        </View>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {!future && plan.stops.length > 0 && <Chip label={t("food:route.restart")} onPress={() => flow({ action: "restart" })} />}
        <DeleteRoute plan={plan} onError={onError} />
      </View>
    </FormScroll>
  );
}
