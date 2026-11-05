import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { Body, Button, Card, ErrorText, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { routeApi, type PlanSummary } from "./api";
import { dayLabel, planLabel, today } from "./dates";
import { DayPicker } from "./DayPicker";

/** The group's day routes: upcoming days first (soonest on top), then past ones. New routes pick a day. */
export function RouteList({ groupId, plans }: { groupId: string; plans: PlanSummary[] }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = today();
  const day = (p: PlanSummary) => p.date ?? p.createdAt.slice(0, 10);
  const upcoming = plans.filter((p) => day(p) >= now).sort((a, b) => day(a).localeCompare(day(b)));
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

  const Item = ({ p }: { p: PlanSummary }) => (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/plan/[id]", params: { id: p.id } })}>
      <Card testID="route-card">
        <Text style={{ color: c.text, fontSize: 17, fontWeight: "600" }}>{planLabel(t, i18n.language, p)}</Text>
        <Body muted>
          {[p.title.trim() && p.date ? dayLabel(t, i18n.language, p.date) : null, t("food:route.progress", { finished: p.finished, total: p.total }), p.currentName ? t("food:route.now", { name: p.currentName }) : null]
            .filter(Boolean)
            .join(" · ")}
        </Body>
      </Card>
    </Pressable>
  );

  return (
    <View style={{ gap: 12 }}>
      <Button label={t("food:route.new")} busy={busy} onPress={() => setPicking(true)} />
      <ErrorText>{error}</ErrorText>
      {plans.length === 0 && <Body muted>{t("food:route.empty")}</Body>}
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
