import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Body, Button, Card, ErrorText, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import { routeApi, type PlanSummary } from "./api";
import { dayLabel, planLabel, today } from "./dates";
import { DayPicker } from "./DayPicker";
import { tripApi, TRANSPORT_ICON, type TripSummary } from "../trips/api";
import { rangeLabel } from "../trips/parts";

/**
 * The group's routes: today's routes first (a trip's day too, so the day you're on is one tap away), then
 * trips (several days with hotels, each day its own route), then day routes: upcoming days first (soonest
 * on top), then past ones. New routes pick a day.
 */
export function RouteList({ groupId, plans: all }: { groupId: string; plans: PlanSummary[] }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trips, setTrips] = useState<TripSummary[]>([]);
  useFocusEffect(
    useCallback(() => {
      tripApi.list(groupId).then(setTrips, () => {});
    }, [groupId]),
  );
  // A trip's days are listed under the trip.
  const plans = all.filter((p) => !p.tripId);
  const now = today();
  const day = (p: PlanSummary) => p.date ?? p.createdAt.slice(0, 10);
  const todays = all.filter((p) => day(p) === now);
  const upcoming = plans.filter((p) => day(p) > now).sort((a, b) => day(a).localeCompare(day(b)));
  const past = plans.filter((p) => day(p) < now).sort((a, b) => day(b).localeCompare(day(a)));

  const create = async (date: string) => {
    setBusy(true);
    setError("");
    try {
      const plan = await routeApi.create(groupId, { date });
      router.push({ pathname: "/plan/[id]", params: { id: plan.id } });
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const tripOf = (p: PlanSummary) => (p.tripId ? trips.find((tr) => tr.id === p.tripId) : undefined);
  const Item = ({ p, highlight }: { p: PlanSummary; highlight?: boolean }) => (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/plan/[id]", params: { id: p.id } })}>
      <Card testID={highlight ? "today-route" : "route-card"} highlight={highlight}>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: "600" }}>
          {p.atHome ? "🏠 " : ""}
          {planLabel(t, i18n.language, p)}
        </Text>
        <Body muted>
          {[tripOf(p) ? `${TRANSPORT_ICON[tripOf(p)!.transport]} ${tripOf(p)!.title || t("food:trip.untitled")}` : null, p.title.trim() && p.date ? dayLabel(t, i18n.language, p.date) : null, t("food:route.progress", { finished: p.finished, total: p.total }), p.currentName ? t("food:route.now", { name: p.currentName }) : null]
            .filter(Boolean)
            .join(" · ")}
        </Body>
      </Card>
    </Pressable>
  );

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label={t("food:route.new")} busy={busy} onPress={() => setPicking(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button kind="plain" label={t("food:trip.new")} onPress={() => router.push({ pathname: "/trip/new", params: { groupId } })} />
        </View>
      </View>
      <ErrorText>{error}</ErrorText>
      {todays.length > 0 && <Text style={{ color: c.accent, fontSize: 14, fontWeight: "700" }}>{t("food:route.today")}</Text>}
      {todays.map((p) => (
        <Item key={p.id} p={p} highlight />
      ))}
      {trips.length > 0 && <Text style={{ color: c.muted, fontSize: 14, fontWeight: "700" }}>{t("food:trip.title")}</Text>}
      {trips.map((tr) => (
        <Pressable key={tr.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/trip/[id]", params: { id: tr.id } })}>
          <Card testID="trip-card">
            <Text style={{ color: c.text, fontSize: 17, fontWeight: "600" }}>
              {TRANSPORT_ICON[tr.transport]} {tr.title || t("food:trip.untitled")}
            </Text>
            <Body muted>
              {[rangeLabel(i18n.language, tr.startDate, tr.endDate), tr.rentalCar ? t("food:trip.withRental") : null, tr.hotels.length ? `🏨 ${tr.hotels.join(", ")}` : null]
                .filter(Boolean)
                .join(" · ")}
            </Body>
          </Card>
        </Pressable>
      ))}
      {plans.length === 0 && trips.length === 0 && <Body muted>{t("food:route.empty")}</Body>}
      {upcoming.length > 0 && <Text style={{ color: c.muted, fontSize: 14, fontWeight: "700" }}>{t("food:route.upcoming")}</Text>}
      {upcoming.map((p) => (
        <Item key={p.id} p={p} />
      ))}
      {past.length > 0 && <Text style={{ color: c.muted, fontSize: 14, fontWeight: "700", marginTop: 6 }}>{t("food:route.past")}</Text>}
      {past.map((p) => (
        <Item key={p.id} p={p} />
      ))}
      <DayPicker visible={picking} value={null} onPick={create} onClose={() => setPicking(false)} />
    </View>
  );
}
