import { LIMITS, type RoutineDay, type RoutineExercise, type WeightUnit } from "@wanderbar/route";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { FormScroll } from "@/components/FormScroll";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, Text, TextInput, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { fitApi, type Routine } from "@/modules/fitness/api";

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** A new routine starts as a 3-day split (the days can be renamed, added or removed). */
function template(t: (k: string) => string): Routine {
  return {
    weeklyGoal: 3,
    unit: "kg",
    days: ["day1", "day2", "day3"].map((k) => ({ id: uid("d"), name: t(`fitness:routine.template.${k}`), exercises: [] })),
  };
}

const blankExercise = (unit: WeightUnit): RoutineExercise => ({ id: uid("e"), name: "", sets: 3, target: "reps", reps: 10, seconds: null, weight: null, unit, restSec: 90, note: "" });

const move = <T,>(list: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

/** My split routine: days → exercises with sets, reps (or seconds), weight and rest. */
export default function RoutineScreen() {
  const { group: groupId } = useLocalSearchParams<{ group: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const [r, setR] = useState<Routine | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fitApi.home(groupId).then(
      (h) => setR(h.routine ?? template(t)),
      (e) => setError(errorText(t, e)),
    );
  }, [groupId, t]);

  if (!r) return error ? <ErrorText>{error}</ErrorText> : <Loading />;

  const setDays = (days: RoutineDay[]) => setR({ ...r, days });
  const setDay = (i: number, d: Partial<RoutineDay>) => setDays(r.days.map((x, j) => (j === i ? { ...x, ...d } : x)));
  const setEx = (di: number, ei: number, e: Partial<RoutineExercise>) => setDay(di, { exercises: r.days[di].exercises.map((x, j) => (j === ei ? { ...x, ...e } : x)) });

  const save = async () => {
    const days = r.days.map((d) => ({ ...d, name: d.name.trim(), exercises: d.exercises.map((e) => ({ ...e, name: e.name.trim(), unit: r.unit })) }));
    if (days.some((d) => !d.name || d.exercises.some((e) => !e.name))) return setError(t("fitness:routine.nameRequired"));
    setBusy(true);
    setError("");
    try {
      await fitApi.saveRoutine(groupId, { ...r, days });
      router.back();
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  const label = (s: string) => <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600" }}>{s}</Text>;
  return (
    <FormScroll testID="routine-editor" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t("fitness:routine.title") }} />
      {label(t("fitness:routine.goal"))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {Array.from({ length: LIMITS.weeklyGoal }, (_, i) => i + 1).map((n) => (
          <Chip key={n} label={String(n)} selected={r.weeklyGoal === n} onPress={() => setR({ ...r, weeklyGoal: n })} />
        ))}
      </View>
      {label(t("fitness:routine.unit"))}
      <View style={{ flexDirection: "row", gap: 6 }}>
        {(["kg", "lb"] as const).map((u) => (
          <Chip key={u} label={u} selected={r.unit === u} onPress={() => setR({ ...r, unit: u })} />
        ))}
      </View>

      {r.days.map((d, di) => (
        <Card key={d.id} testID={`day-${di}`}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>{t("fitness:routine.day", { n: di + 1 })}</Text>
          <Field label={t("fitness:routine.dayName")} value={d.name} onChangeText={(name) => setDay(di, { name })} />
          {d.exercises.length === 0 ? <Body muted>{t("fitness:routine.noExercises")}</Body> : null}
          {d.exercises.map((e, ei) => (
            <View key={e.id} testID={`exercise-${di}-${ei}`} style={{ borderColor: c.border, borderWidth: 1.5, borderRadius: 18, padding: 12, gap: 8 }}>
              <Field label={t("fitness:routine.exercise")} value={e.name} onChangeText={(name) => setEx(di, ei, { name })} />
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Chip label={t("fitness:routine.byReps")} selected={e.target === "reps"} onPress={() => setEx(di, ei, { target: "reps", reps: e.reps ?? 10, seconds: null })} />
                <Chip label={t("fitness:routine.byTime")} selected={e.target === "time"} onPress={() => setEx(di, ei, { target: "time", seconds: e.seconds ?? 60, reps: null })} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <NumField label={t("fitness:routine.sets")} value={e.sets} max={LIMITS.sets} min={1} onChange={(sets) => setEx(di, ei, { sets: sets ?? 1 })} />
                {e.target === "reps" ? (
                  <NumField label={t("fitness:routine.reps")} value={e.reps} max={LIMITS.reps} min={1} onChange={(reps) => setEx(di, ei, { reps: reps ?? 1 })} />
                ) : (
                  <NumField label={t("fitness:routine.seconds")} value={e.seconds} max={LIMITS.seconds} min={1} onChange={(seconds) => setEx(di, ei, { seconds: seconds ?? 1 })} />
                )}
                <NumField label={t("fitness:routine.weight", { unit: r.unit })} value={e.weight} max={LIMITS.weight} decimals optional onChange={(weight) => setEx(di, ei, { weight })} />
                <NumField label={t("fitness:routine.rest")} value={e.restSec} max={LIMITS.restSec} min={0} onChange={(restSec) => setEx(di, ei, { restSec: restSec ?? 0 })} />
              </View>
              <Field label={t("fitness:routine.note")} value={e.note} onChangeText={(note) => setEx(di, ei, { note: note.slice(0, LIMITS.note) })} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                <Chip label={t("fitness:routine.moveUp")} disabled={ei === 0} onPress={() => setDay(di, { exercises: move(d.exercises, ei, -1) })} />
                <Chip label={t("fitness:routine.moveDown")} disabled={ei === d.exercises.length - 1} onPress={() => setDay(di, { exercises: move(d.exercises, ei, 1) })} />
                <Chip label={t("fitness:routine.remove")} onPress={() => setDay(di, { exercises: d.exercises.filter((_, j) => j !== ei) })} />
              </View>
            </View>
          ))}
          {d.exercises.length < LIMITS.exercises ? (
            <Button kind="plain" label={t("fitness:routine.addExercise")} onPress={() => setDay(di, { exercises: [...d.exercises, blankExercise(r.unit)] })} />
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Chip label={t("fitness:routine.moveUp")} disabled={di === 0} onPress={() => setDays(move(r.days, di, -1))} />
            <Chip label={t("fitness:routine.moveDown")} disabled={di === r.days.length - 1} onPress={() => setDays(move(r.days, di, 1))} />
            {r.days.length > 1 ? <Chip label={t("fitness:routine.removeDay")} onPress={() => setDays(r.days.filter((_, j) => j !== di))} /> : null}
          </View>
        </Card>
      ))}
      {r.days.length < LIMITS.days ? (
        <Button kind="plain" label={t("fitness:routine.addDay")} onPress={() => setDays([...r.days, { id: uid("d"), name: t("fitness:routine.day", { n: r.days.length + 1 }), exercises: [] }])} />
      ) : null}
      <Button label={t("fitness:routine.save")} busy={busy} onPress={save} />
      <ErrorText>{error}</ErrorText>
    </FormScroll>
  );
}

/** A small number box. Empty means "none" only where that's allowed (weight). */
function NumField({ label, value, onChange, min = 0, max, decimals, optional }: { label: string; value: number | null; onChange: (n: number | null) => void; min?: number; max: number; decimals?: boolean; optional?: boolean }) {
  const c = useColors();
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    if ((text === "" ? null : Number(text)) !== value) setText(value == null ? "" : String(value));
    // Only when the value changes from outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const change = (s: string) => {
    const clean = s.replace(decimals ? /[^\d.]/g : /\D/g, "");
    setText(clean);
    if (clean === "") return onChange(optional ? null : min);
    const n = Number(clean);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, decimals ? Math.round(n * 100) / 100 : Math.round(n))));
  };
  return (
    <View style={{ gap: 4, width: 96 }}>
      <Text style={{ color: c.muted, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={text}
        onChangeText={change}
        keyboardType={decimals ? "decimal-pad" : "number-pad"}
        style={{ color: c.text, backgroundColor: c.card, borderColor: c.border, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18 }}
      />
    </View>
  );
}

