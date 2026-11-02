import { hoursStatusFromText, Links, parseSharedText, teslaShareTextWithFallback } from "@wanderbar/route";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { copyText } from "@/core/platform/clipboard";
import { confirm } from "@/core/platform/confirm";
import { canSendToTesla, sendToTesla } from "@/core/platform/tesla";
import { HoursBadge } from "@/modules/food/route/HoursBadge";
import { routeApi, type Plan, type Stop } from "@/modules/food/route/api";
import { useNow, useTeslaFormat } from "@/modules/food/route/hooks";

/** One day route: the "now" card on top, then every stop in order (same flow as the old wanderbar app). */
export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const now = useNow();
  const { format } = useTeslaFormat();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quick, setQuick] = useState("");
  const [adding, setAdding] = useState(false);

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

  const tesla = async (s: Stop) => {
    setNotice("");
    const how = await sendToTesla(teslaShareTextWithFallback(format, s));
    if (how === "fallback") setNotice(t("food:route.teslaNoApp"));
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

  const closedNow = current && hoursStatusFromText(current.hoursRaw, now).kind === "closed";

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: plan.title }} />

      {current ? (
        <Card highlight>
          <Text style={{ color: c.accent, fontSize: 13, fontWeight: "700" }}>{t("food:route.current")}</Text>
          <Pressable onPress={() => openStop(current)}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{current.name}</Text>
            {current.address ? <Body muted>{current.address}</Body> : null}
          </Pressable>
          <HoursBadge hoursRaw={current.hoursRaw} now={now} />
          {closedNow && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: c.danger }}>{t("food:route.closedWarning")}</Text>
              <Chip label={t("food:route.next")} onPress={() => flow({ action: "postpone", stopId: current.id })} />
            </View>
          )}
          {canSendToTesla ? (
            <Button label={t("food:route.sendTesla")} onPress={() => tesla(current)} />
          ) : (
            <Button
              label={t("food:route.copyAddress")}
              onPress={() => copyText(current.address || current.name).then(() => setNotice(t("food:route.copied")))}
            />
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label={t("food:route.done")} onPress={() => flow({ action: "complete", stopId: current.id })} />
            <Chip label={t("food:route.skip")} onPress={() => flow({ action: "postpone", stopId: current.id })} />
            <Chip label={t("food:route.directions")} onPress={() => Linking.openURL(Links.googleDirections(current.name, current.address))} />
            <Chip label={t("food:route.yelp")} onPress={() => Linking.openURL(Links.yelpSearch(current.name, current.address))} />
          </View>
        </Card>
      ) : plan.stops.length > 0 ? (
        <Card>
          <Body muted>{t("food:route.nothingCurrent")}</Body>
          <Chip label={t("food:route.restart")} onPress={() => flow({ action: "restart" })} />
        </Card>
      ) : null}

      {notice ? <Body muted>{notice}</Body> : null}
      <ErrorText>{error}</ErrorText>

      {plan.stops.map((s, i) => {
        const dim = s.status === "done" || s.status === "skipped";
        return (
          <Pressable key={s.id} onPress={() => openStop(s)}>
            <View
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
                  <HoursBadge hoursRaw={s.hoursRaw} now={now} />
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

      <Field value={quick} onChangeText={setQuick} placeholder={t("food:route.addPlaceholder")} onSubmitEditing={add} />
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
