import { Links, parseSharedText, TESLA_FORMATS, teslaShareText } from "@wanderbar/route";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, ScrollView, Text, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { canSendToTesla, sendToTesla } from "@/core/platform/tesla";
import { HoursBadge } from "@/modules/food/route/HoursBadge";
import { routeApi, type Stop } from "@/modules/food/route/api";
import { useNow, useTeslaFormat } from "@/modules/food/route/hooks";

/** Place detail + edit, status actions, and the Tesla format tester (as in the old app). */
export default function StopScreen() {
  const { id: planId, stopId } = useLocalSearchParams<{ id: string; stopId: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const now = useNow();
  const tesla = useTeslaFormat();
  const [stop, setStop] = useState<Stop | null>(null);
  const [form, setForm] = useState({ name: "", address: "", mapsUrl: "", hoursRaw: "", memo: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    routeApi
      .get(planId)
      .then((p) => {
        const s = p.stops.find((x) => x.id === stopId);
        if (!s) return setError(t("errors.not_found"));
        setStop(s);
        setForm({ name: s.name, address: s.address, mapsUrl: s.mapsUrl, hoursRaw: s.hoursRaw, memo: s.memo });
      })
      .catch((e) => setError(errorText(t, e)));
  }, [planId, stopId, t]);

  if (!stop) return error ? <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}><ErrorText>{error}</ErrorText></View> : <Loading />;

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  /** Pasting a whole Google Maps share fills name/address and keeps just the link. */
  const onMapsUrl = (v: string) => {
    if (/\n/.test(v) || (/https?:\/\//.test(v) && !/^https?:\/\/\S+$/.test(v.trim()))) {
      const p = parseSharedText(v);
      setForm((f) => ({ ...f, mapsUrl: p.mapsUrl ?? "", name: f.name || p.name, address: f.address || p.address }));
    } else set("mapsUrl")(v);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      setStop(await routeApi.updateStop(stop.id, form));
      setNotice(t("food:stop.saved"));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setSaving(false);
    }
  };

  const flow = async (action: "setCurrent" | "drop" | "restore") => {
    try {
      const stops = await routeApi.flow(planId, { action, stopId: stop.id });
      setStop(stops.find((s) => s.id === stop.id) ?? stop);
      if (action === "setCurrent") router.back();
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  const dest = { ...stop, ...form };
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: stop.name }} />
      <Body muted>{t(`food:route.status.${stop.status}`)}</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {stop.status !== "current" && stop.status !== "done" && <Chip label={t("food:route.goHere")} onPress={() => flow("setCurrent")} />}
        {(stop.status === "pending" || stop.status === "current") && <Chip label={t("food:route.drop")} onPress={() => flow("drop")} />}
        {(stop.status === "done" || stop.status === "skipped") && <Chip label={t("food:route.restore")} onPress={() => flow("restore")} />}
        <Chip label={t("food:route.directions")} onPress={() => Linking.openURL(Links.googleDirections(dest.name, dest.address))} />
        <Chip label="Google Maps" onPress={() => Linking.openURL(dest.mapsUrl || Links.googleSearch(dest.name, dest.address))} />
        <Chip label={t("food:route.yelp")} onPress={() => Linking.openURL(dest.yelpUrl || Links.yelpSearch(dest.name, dest.address))} />
      </View>

      <Field label={t("food:stop.name")} value={form.name} onChangeText={set("name")} />
      <Field label={t("food:stop.address")} value={form.address} onChangeText={set("address")} />
      <Field label={t("food:stop.mapsUrl")} value={form.mapsUrl} onChangeText={onMapsUrl} hint={t("food:stop.mapsUrlHint")} />
      <Field label={t("food:stop.hours")} value={form.hoursRaw} onChangeText={set("hoursRaw")} hint={t("food:stop.hoursHint")} multiline />
      <HoursBadge hoursRaw={form.hoursRaw} now={now} />
      <Field label={t("food:stop.memo")} value={form.memo} onChangeText={set("memo")} multiline />
      <Button label={t("food:stop.save")} busy={saving} disabled={!form.name.trim()} onPress={save} />
      {notice ? <Body muted>{notice}</Body> : null}
      <ErrorText>{error}</ErrorText>

      {canSendToTesla && (
        <Card>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }}>{t("food:tesla.tester")}</Text>
          <Body muted>{t("food:tesla.testerHint")}</Body>
          {TESLA_FORMATS.map((f) => {
            const text = teslaShareText(f, dest);
            const inUse = tesla.format === f;
            return (
              <View key={f} style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border }}>
                <Text style={{ color: c.text, fontWeight: "600" }}>
                  {t(`food:tesla.format.${f}`)}
                  {inUse ? ` · ${t("food:tesla.inUse")}` : ""}
                </Text>
                <Text style={{ color: c.muted, fontFamily: "monospace", fontSize: 13 }}>{text ?? t("food:tesla.unavailable")}</Text>
                {text && (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Chip label={t("food:tesla.send")} onPress={() => sendToTesla(text)} />
                    {!inUse && <Chip label={t("food:tesla.useThis")} onPress={() => tesla.save(f).catch((e) => setError(errorText(t, e)))} />}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}

      <Chip
        label={t("food:route.deleteStop")}
        onPress={async () => {
          if (!(await confirm(t("food:route.confirmDeleteStop"), t("common.delete"), t("common.cancel")))) return;
          await routeApi.deleteStop(stop.id).then(() => router.back(), (e) => setError(errorText(t, e)));
        }}
      />
    </ScrollView>
  );
}
