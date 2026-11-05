import { formatDistance, hoursStatusFromText, Links, parseSharedText } from "@wanderbar/route";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Loading, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { HoursBadge } from "@/modules/food/route/HoursBadge";
import { routeApi, type Plan, type Stop } from "@/modules/food/route/api";
import { formatDuration } from "@/modules/food/route/format";
import { useGoogleAvailable, type PlaceDetails } from "@/modules/food/route/google";
import { PlaceSearch } from "@/modules/food/route/PlaceSearch";
import { useRoute } from "@/modules/food/route/useRoute";
import { useNow } from "@/modules/food/route/hooks";
import { ShareMenu } from "@/modules/food/route/ShareMenu";
import { dayLabel, planLabel, today } from "@/modules/food/route/dates";
import { DayPicker } from "@/modules/food/route/DayPicker";

/** One day route: the "now" card on top, then every stop in order (same flow as the old wanderbar app). */
export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const now = useNow();
  const googleAvailable = useGoogleAvailable();
  /** A restaurant stop just finished: offer to rate what was eaten there. */
  const [justAte, setJustAte] = useState<Stop | null>(null);
  const [pickingDay, setPickingDay] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quick, setQuick] = useState("");
  const [adding, setAdding] = useState(false);
  const route = useRoute(plan?.stops ?? []);

  useFocusEffect(
    useCallback(() => {
      routeApi.get(id).then(setPlan).catch((e) => setError(errorText(t, e)));
    }, [id, t]),
  );

  if (!plan) return error ? <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}><ErrorText>{error}</ErrorText></View> : <Loading />;

  const setStops = (stops: Stop[]) => setPlan((p) => (p ? { ...p, stops } : p));
  const run = async (fn: () => Promise<Stop[]>) => {
    setError("");
    setNotice("");
    try {
      setStops(await fn());
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  const flow = (a: Parameters<typeof routeApi.flow>[1]) => run(() => routeApi.flow(plan.id, a));
  const openStop = (s: Stop) => router.push({ pathname: "/plan/[id]/stop/[stopId]", params: { id: plan.id, stopId: s.id } });

  const current = plan.stops.find((s) => s.status === "current");

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

  // Another day than today: hours are shown for that day, and "closed now" warnings don't apply.
  const otherDay = plan.date && plan.date !== today() ? plan.date : null;
  const closedNow = !otherDay && current && hoursStatusFromText(current.hoursRaw, now).kind === "closed";

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
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

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID="plan-day">
        <Text style={{ color: c.text, fontSize: 16, fontWeight: "600" }}>{plan.date ? dayLabel(t, i18n.language, plan.date) : ""}</Text>
        <Chip label={t("food:date.change")} onPress={() => setPickingDay(true)} />
      </View>
      <DayPicker
        visible={pickingDay}
        value={plan.date}
        onPick={(date) => routeApi.update(plan.id, { date }).then((p) => setPlan((old) => (old ? { ...old, date: p.date } : old)), (e) => setError(errorText(t, e)))}
        onClose={() => setPickingDay(false)}
      />

      {current ? (
        <Card highlight testID="current-card">
          <Text style={{ color: c.accent, fontSize: 13, fontWeight: "700" }}>{t("food:route.current")}</Text>
          <Pressable onPress={() => openStop(current)}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{current.name}</Text>
            {current.address ? <Body muted>{current.address}</Body> : null}
          </Pressable>
          <HoursBadge hoursRaw={current.hoursRaw} now={now} day={otherDay} />
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
            <Chip label={t("food:route.directions")} onPress={() => Linking.openURL(Links.googleDirections(current.name, current.address))} />
          </View>
        </Card>
      ) : plan.stops.length > 0 ? (
        <Card>
          <Body muted>{t("food:route.nothingCurrent")}</Body>
          <Chip label={t("food:route.restart")} onPress={() => flow({ action: "restart" })} />
        </Card>
      ) : null}

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
          {route.remainingSeconds > 0 && route.remainingSeconds < route.result.seconds
            ? ` · ${t("food:route.remaining", { time: formatDuration(t, route.remainingSeconds) })}`
            : ""}
        </Body>
      )}
      {notice ? <Body muted>{notice}</Body> : null}
      <ErrorText>{error}</ErrorText>

      {plan.stops.map((s, i) => {
        const dim = s.status === "done" || s.status === "skipped";
        return (
          <Pressable key={s.id} onPress={() => openStop(s)}>
            <View
              testID={`stop-row-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: s.status === "current" ? c.accent : c.border,
                backgroundColor: c.card,
                opacity: dim ? 0.5 : 1,
              }}
            >
              <Text style={{ color: c.muted, width: 22, textAlign: "right" }}>{i + 1}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{ color: c.text, fontSize: 16, fontWeight: s.status === "current" ? "700" : "500", textDecorationLine: s.status === "skipped" ? "line-through" : "none" }}
                  numberOfLines={1}
                >
                  {s.name}
                </Text>
                {dim ? (
                  <Text style={{ color: c.muted, fontSize: 13 }}>{t(`food:route.status.${s.status}`)}</Text>
                ) : (
                  <HoursBadge hoursRaw={s.hoursRaw} now={now} day={otherDay} />
                )}
                {!dim && route.legTo.get(s.id) && (
                  <Text style={{ color: c.muted, fontSize: 13 }}>
                    {t("food:route.legFromPrev", { time: formatDuration(t, route.legTo.get(s.id)!.seconds) })}
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: "row", gap: 4 }}>
                <Pressable accessibilityLabel={t("food:route.moveUp")} hitSlop={6} disabled={i === 0} onPress={() => flow({ action: "move", from: i, to: i - 1 })}>
                  <Text style={{ color: i === 0 ? c.border : c.muted, fontSize: 20, paddingHorizontal: 6 }}>▲</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={t("food:route.moveDown")}
                  hitSlop={6}
                  disabled={i === plan.stops.length - 1}
                  onPress={() => flow({ action: "move", from: i, to: i + 1 })}
                >
                  <Text style={{ color: i === plan.stops.length - 1 ? c.border : c.muted, fontSize: 20, paddingHorizontal: 6 }}>▼</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        );
      })}

      <PlaceSearch
        value={quick}
        onChangeText={setQuick}
        onPick={(d) => addPicked(d).catch((e) => setError(errorText(t, e)))}
        onSubmit={() => add()}
        near={near}
        placeholder={googleAvailable ? t("food:route.searchPlaceholder") : t("food:route.addPlaceholder")}
      />
      <Button kind="plain" label={t("food:route.add")} busy={adding} disabled={!quick.trim()} onPress={add} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {plan.stops.length > 0 && <Chip label={t("food:route.restart")} onPress={() => flow({ action: "restart" })} />}
        <Chip
          label={t("food:route.deleteRoute")}
          onPress={async () => {
            if (!(await confirm(t("food:route.confirmDeleteRoute"), t("common.delete"), t("common.cancel")))) return;
            await routeApi.remove(plan.id).then(() => router.back(), (e) => setError(errorText(t, e)));
          }}
        />
      </View>
    </ScrollView>
  );
}
