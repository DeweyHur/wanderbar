import { LIMITS, type RoutineDay, type RoutineExercise, type WeightUnit } from "@wanderbar/route";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useGroupLook } from "@/core/groupLook";
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
  const [dayIx, setDayIx] = useState(0);
  const [openRow, setOpenRow] = useState<string | null>(null);
  useGroupLook(groupId);

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

  const di = Math.min(dayIx, r.days.length - 1);
  const day = r.days[di];
  const head = { color: c.muted, fontSize: 12, fontWeight: "600" as const, textAlign: "center" as const };
  const cell = { color: c.text, backgroundColor: c.card, borderColor: c.border, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 8, fontSize: 16, textAlign: "center" as const };
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

      {/* One day at a time: tabs for the days, a table for the day's exercises. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} testID="day-tabs">
        {r.days.map((d, di) => (
          <Chip key={d.id} label={`${di + 1}. ${d.name || t("fitness:routine.day", { n: di + 1 })}`} selected={di === dayIx} onPress={() => setDayIx(di)} />
        ))}
        {r.days.length < LIMITS.days ? (
          <Chip
            label={`+ ${t("fitness:routine.addDay")}`}
            onPress={() => {
              setDays([...r.days, { id: uid("d"), name: t("fitness:routine.day", { n: r.days.length + 1 }), exercises: [] }]);
              setDayIx(r.days.length);
            }}
          />
        ) : null}
      </View>

      {day ? (
        <Card testID={`day-${di}`}>
          <Field label={t("fitness:routine.dayName")} value={day.name} onChangeText={(name) => setDay(di, { name })} />
          {day.exercises.length === 0 ? (
            <Body muted>{t("fitness:routine.noExercises")}</Body>
          ) : (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: CELL_GAP }}>
                <Text style={[head, { flex: 1, flexBasis: 0, minWidth: 0, textAlign: "left" }]}>{t("fitness:routine.exercise")}</Text>
                <Text style={[head, { width: CELL }]}>{t("fitness:routine.colSets")}</Text>
                <Text style={[head, { width: CELL }]}>{t("fitness:routine.colTarget")}</Text>
                <Text style={[head, { width: CELL + 8 }]}>{r.unit}</Text>
                <Text style={[head, { width: CELL }]}>{t("fitness:routine.colRest")}</Text>
                <View style={{ width: MORE }} />
              </View>
              {day.exercises.map((e, ei) => {
                const open = openRow === e.id;
                return (
                  <View key={e.id} testID={`exercise-${di}-${ei}`} style={{ gap: 6, borderTopWidth: 1, borderColor: c.border, paddingTop: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: CELL_GAP }}>
                      <TextInput
                        accessibilityLabel={t("fitness:routine.exercise")}
                        value={e.name}
                        onChangeText={(name) => setEx(di, ei, { name })}
                        placeholder={t("fitness:routine.exercisePlaceholder")}
                        placeholderTextColor={c.muted}
                        style={[cell, { flex: 1, flexBasis: 0, minWidth: 0, width: 0, textAlign: "left" }]}
                      />
                      <NumCell label={t("fitness:routine.sets")} value={e.sets} max={LIMITS.sets} min={1} onChange={(sets) => setEx(di, ei, { sets: sets ?? 1 })} />
                      {e.target === "reps" ? (
                        <NumCell label={t("fitness:routine.reps")} value={e.reps} max={LIMITS.reps} min={1} onChange={(reps) => setEx(di, ei, { reps: reps ?? 1 })} />
                      ) : (
                        <NumCell label={t("fitness:routine.seconds")} value={e.seconds} max={LIMITS.seconds} min={1} suffix="s" onChange={(seconds) => setEx(di, ei, { seconds: seconds ?? 1 })} />
                      )}
                      <NumCell label={t("fitness:routine.weight", { unit: r.unit })} value={e.weight} max={LIMITS.weight} decimals optional wide placeholder="–" onChange={(weight) => setEx(di, ei, { weight })} />
                      <NumCell label={t("fitness:routine.rest")} value={e.restSec} max={LIMITS.restSec} min={0} onChange={(restSec) => setEx(di, ei, { restSec: restSec ?? 0 })} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("fitness:routine.more")}
                        accessibilityState={{ expanded: open }}
                        onPress={() => setOpenRow(open ? null : e.id)}
                        hitSlop={6}
                        style={{ width: MORE, height: 40, alignItems: "center", justifyContent: "center" }}
                      >
                        <Text style={{ color: c.accent, fontSize: 20, fontWeight: "700" }}>{open ? "▴" : "⋯"}</Text>
                      </Pressable>
                    </View>
                    {e.note && !open ? <Text style={{ color: c.muted, fontSize: 13 }}>{e.note}</Text> : null}
                    {open ? (
                      <View style={{ gap: 8, paddingBottom: 6 }}>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                          <Chip label={t("fitness:routine.byReps")} selected={e.target === "reps"} onPress={() => setEx(di, ei, { target: "reps", reps: e.reps ?? 10, seconds: null })} />
                          <Chip label={t("fitness:routine.byTime")} selected={e.target === "time"} onPress={() => setEx(di, ei, { target: "time", seconds: e.seconds ?? 60, reps: null })} />
                        </View>
                        <Field label={t("fitness:routine.note")} value={e.note} onChangeText={(note) => setEx(di, ei, { note: note.slice(0, LIMITS.note) })} />
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                          <Chip label={t("fitness:routine.moveUp")} disabled={ei === 0} onPress={() => setDay(di, { exercises: move(day.exercises, ei, -1) })} />
                          <Chip label={t("fitness:routine.moveDown")} disabled={ei === day.exercises.length - 1} onPress={() => setDay(di, { exercises: move(day.exercises, ei, 1) })} />
                          <Chip label={t("fitness:routine.remove")} onPress={() => setDay(di, { exercises: day.exercises.filter((_, j) => j !== ei) })} />
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
          {day.exercises.length < LIMITS.exercises ? (
            <Button kind="plain" label={t("fitness:routine.addExercise")} onPress={() => setDay(di, { exercises: [...day.exercises, blankExercise(r.unit)] })} />
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Chip label={t("fitness:routine.moveLeft")} disabled={di === 0} onPress={() => (setDays(move(r.days, di, -1)), setDayIx(di - 1))} />
            <Chip label={t("fitness:routine.moveRight")} disabled={di === r.days.length - 1} onPress={() => (setDays(move(r.days, di, 1)), setDayIx(di + 1))} />
            {r.days.length > 1 ? <Chip label={t("fitness:routine.removeDay")} onPress={() => (setDays(r.days.filter((_, j) => j !== di)), setDayIx(Math.max(0, di - 1)))} /> : null}
          </View>
        </Card>
      ) : null}
      <Button label={t("fitness:routine.save")} busy={busy} onPress={save} />
      <ErrorText>{error}</ErrorText>
    </FormScroll>
  );
}

const CELL = 44;
const CELL_GAP = 4;
const MORE = 28;

/** A number cell in the table. Empty means "none" only where that's allowed (weight). */
function NumCell({
  label,
  value,
  onChange,
  min = 0,
  max,
  decimals,
  optional,
  wide,
  placeholder,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  min?: number;
  max: number;
  decimals?: boolean;
  optional?: boolean;
  wide?: boolean;
  placeholder?: string;
  suffix?: string;
}) {
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
    <TextInput
      accessibilityLabel={label}
      value={text}
      onChangeText={change}
      placeholder={placeholder ?? suffix}
      placeholderTextColor={c.muted}
      keyboardType={decimals ? "decimal-pad" : "number-pad"}
      selectTextOnFocus
      style={{
        width: wide ? CELL + 8 : CELL,
        color: c.text,
        backgroundColor: c.card,
        borderColor: c.border,
        borderWidth: 1.5,
        borderRadius: 10,
        paddingHorizontal: 2,
        paddingVertical: 8,
        fontSize: 16,
        textAlign: "center",
      }}
    />
  );
}
