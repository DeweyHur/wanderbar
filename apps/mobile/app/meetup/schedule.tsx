import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { bgApi, type Home, type Series, type SeriesInput } from "@/modules/boardgame/api";
import { localParts, timeLabel } from "@/modules/boardgame/format";
import { SectionTitle } from "@/modules/boardgame/parts";

/** Regular meetups (day, time, every N weeks, where) and one-off nights. Owner and hosts. */
export default function Schedule() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [home, setHome] = useState<Home | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    bgApi
      .home(groupId)
      .then(setHome)
      .catch((e) => setError(errorText(t, e)));
  }, [groupId, t]);
  useFocusEffect(load);

  if (!home) return error ? <ErrorText>{error}</ErrorText> : <Loading />;

  const run = async (p: Promise<unknown>, done = "") => {
    setError("");
    setNotice("");
    try {
      await p;
      setNotice(done);
      setEditing(null);
      load();
      return true;
    } catch (e) {
      setError(errorText(t, e));
      return false;
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t("boardgame:schedule.title") }} />
      {!home.canManage && <Body muted>{t("boardgame:schedule.managersOnly")}</Body>}
      {home.series.length === 0 && <Body muted>{t("boardgame:schedule.none")}</Body>}
      {home.series.map((s) =>
        editing === s.id ? (
          <SeriesForm
            key={s.id}
            tz={home.timezone}
            initial={s}
            onSave={(x) => run(bgApi.updateSeries(s.id, x), t("boardgame:schedule.saved"))}
            onStop={async () => {
              if (await confirm(t("boardgame:schedule.confirmStop"), t("common.delete"), t("common.cancel"))) await run(bgApi.deleteSeries(s.id));
            }}
          />
        ) : (
          <Card key={s.id} testID="series-card">
            {s.title ? <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }}>{s.title}</Text> : null}
            <Body>
              {t("boardgame:schedule.summary", {
                every: t("boardgame:every", { count: s.everyWeeks }),
                weekday: t(`boardgame:weekday.${s.weekday}`),
                time: timeLabel(s.time, i18n.language),
              })}
            </Body>
            {s.location ? <Body muted>{s.location}</Body> : null}
            {home.canManage && (
              <View style={{ flexDirection: "row" }}>
                <Chip label={t("boardgame:schedule.edit")} onPress={() => setEditing(s.id)} />
              </View>
            )}
          </Card>
        ),
      )}
      {home.canManage && editing !== "new" && (
        <Button kind={home.series.length ? "plain" : "primary"} label={t("boardgame:schedule.add")} onPress={() => setEditing("new")} />
      )}
      {editing === "new" && <SeriesForm tz={home.timezone} onSave={(x) => run(bgApi.createSeries(groupId, x), t("boardgame:schedule.saved"))} />}
      {notice ? <Body muted>{notice}</Body> : null}
      <ErrorText>{error}</ErrorText>

      {home.canManage && (
        <>
          <SectionTitle>{t("boardgame:schedule.oneOff")}</SectionTitle>
          <OneOff
            tz={home.timezone}
            onCreate={async (x) => {
              setError("");
              try {
                const night = await bgApi.createNight(groupId, x);
                router.replace({ pathname: "/night/[id]", params: { id: night.id } });
              } catch (e) {
                setError(errorText(t, e));
              }
            }}
          />
        </>
      )}
    </ScrollView>
  );
}

function SeriesForm({ tz, initial, onSave, onStop }: { tz: string; initial?: Series; onSave: (s: SeriesInput) => void; onStop?: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [weekday, setWeekday] = useState(initial?.weekday ?? 6);
  const [time, setTime] = useState(initial?.time ?? "19:00");
  const [everyWeeks, setEveryWeeks] = useState(initial?.everyWeeks ?? 1);
  const [location, setLocation] = useState(initial?.location ?? "");
  const label = (s: string) => <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600" }}>{s}</Text>;
  return (
    <Card testID="series-form">
      <Field label={t("boardgame:schedule.titleField")} value={title} onChangeText={setTitle} placeholder={t("boardgame:schedule.titlePlaceholder")} />
      {label(t("boardgame:schedule.weekdayField"))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <Chip key={d} label={t(`boardgame:weekday.${d}`)} selected={weekday === d} onPress={() => setWeekday(d)} />
        ))}
      </View>
      <Field label={t("boardgame:schedule.timeField")} value={time} onChangeText={setTime} placeholder="19:00" hint={t("boardgame:schedule.timeHint", { tz })} />
      {label(t("boardgame:schedule.repeatField"))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[1, 2, 3, 4].map((n) => (
          <Chip key={n} label={t("boardgame:every", { count: n })} selected={everyWeeks === n} onPress={() => setEveryWeeks(n)} />
        ))}
      </View>
      <Field label={t("boardgame:schedule.location")} value={location} onChangeText={setLocation} placeholder={t("boardgame:schedule.locationPlaceholder")} />
      <Button label={t("boardgame:schedule.save")} onPress={() => onSave({ title, weekday, time: time.trim(), everyWeeks, location })} />
      {onStop && (
        <View style={{ flexDirection: "row" }}>
          <Chip label={t("boardgame:schedule.stop")} onPress={onStop} />
        </View>
      )}
    </Card>
  );
}

function OneOff({ tz, onCreate }: { tz: string; onCreate: (x: { date: string; time: string; location: string }) => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(() => localParts(new Date().toISOString(), tz).date);
  const [time, setTime] = useState("19:00");
  const [location, setLocation] = useState("");
  return (
    <Card testID="one-off-form">
      <Field label={t("boardgame:schedule.date")} value={date} onChangeText={setDate} placeholder="2026-11-07" />
      <Field label={t("boardgame:schedule.timeField")} value={time} onChangeText={setTime} placeholder="19:00" />
      <Field label={t("boardgame:schedule.location")} value={location} onChangeText={setLocation} />
      <Button kind="plain" label={t("boardgame:schedule.createNight")} onPress={() => onCreate({ date: date.trim(), time: time.trim(), location })} />
    </Card>
  );
}
