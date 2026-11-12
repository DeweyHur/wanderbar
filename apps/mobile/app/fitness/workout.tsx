import {
  adjustRest,
  allDone,
  closeExercise,
  completeSet,
  currentSet,
  editLastSet,
  exerciseDone,
  finishWorkout,
  nextDay,
  openExercise,
  plannedWeight,
  restClock,
  secondsLeft,
  setsDone,
  skipRest,
  startTimed,
  tick,
  workoutSummary,
  type DoneSet,
  type Workout,
} from "@wanderbar/route";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useGroupLook } from "@/core/groupLook";
import { FormScroll } from "@/components/FormScroll";
import { Body, Button, Card, Chip, Loading, Text, TextInput, useColors } from "@/components/ui";
import { confirm } from "@/core/platform/confirm";
import { fitApi, type FitnessHome } from "@/modules/fitness/api";
import { BigButton } from "@/modules/fitness/FitnessHome";
import { setsText, targetText, volumeText } from "@/modules/fitness/format";
import { buzz, cancelRest, prepareRestAlarm, scheduleRest } from "@/modules/fitness/restAlarm";
import { workoutStore } from "@/modules/fitness/store";

/**
 * Today's workout: pick any exercise (the machine may be taken) → "Set 2 of 4" with one big button →
 * rest countdown (a notification when it's over) → next set … → finish, and what's next in the cycle.
 */
export default function WorkoutScreen() {
  const { group: groupId } = useLocalSearchParams<{ group: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const [w, setW] = useState<Workout | null>(null);
  const [missing, setMissing] = useState(false);
  const [synced, setSynced] = useState(true);
  const [home, setHome] = useState<FitnessHome | null>(null);
  const [now, setNow] = useState(() => new Date());
  const latest = useRef<Workout | null>(null);
  useGroupLook(groupId);

  useEffect(() => {
    workoutStore.load(groupId).then((s) => {
      if (!s) return setMissing(true);
      latest.current = s.workout;
      setW(s.workout);
      setSynced(s.synced);
    });
    fitApi.home(groupId).then(setHome, () => {});
    prepareRestAlarm(t("fitness:workout.channel")).catch(() => {});
  }, [groupId, t]);

  /** Every change: on the phone first, then to the server (which may fail at the gym; it's retried). */
  const commit = useCallback(
    (next: Workout) => {
      const before = latest.current;
      if (next === before) return;
      latest.current = next;
      setW(next);
      workoutStore.save(groupId, { workout: next, synced: false });
      const restChanged = next.phase?.kind === "rest" ? !(before?.phase?.kind === "rest" && before.phase.endsAt === next.phase.endsAt) : before?.phase?.kind === "rest";
      if (restChanged) {
        if (next.phase?.kind === "rest") {
          const cur = currentSet(next)!;
          scheduleRest(new Date(next.phase.endsAt), {
            title: t("fitness:workout.restOverTitle"),
            body: t("fitness:workout.restOverBody", { name: cur.exercise.name, n: cur.set, total: cur.total }),
            path: `/fitness/workout?group=${groupId}`,
          });
        } else cancelRest();
      }
      const setsChanged = !before || before.sets !== next.sets || before.endedAt !== next.endedAt;
      if (!setsChanged) return;
      fitApi.saveWorkout(next).then(
        () => {
          if (latest.current !== next) return;
          setSynced(true);
          workoutStore.save(groupId, { workout: next, synced: true });
        },
        () => setSynced(false),
      );
    },
    [groupId, t],
  );

  // The clock: finishes timed sets and rests, even ones that ran out while the app was closed.
  useEffect(() => {
    if (!w || w.endedAt) return;
    const id = setInterval(() => {
      const at = new Date();
      setNow(at);
      const cur = latest.current;
      if (!cur) return;
      const next = tick(cur, at);
      if (next !== cur) {
        if (cur.phase?.kind === "rest" && next.phase?.kind === "work") buzz();
        commit(tick(next, at));
      }
    }, 250);
    return () => clearInterval(id);
  }, [w?.id, w?.endedAt, commit]);

  if (missing) {
    return (
      <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}>
        <Button label={t("fitness:workout.backToGroup")} onPress={() => router.replace({ pathname: "/group/[id]", params: { id: groupId } })} />
      </View>
    );
  }
  if (!w) return <Loading />;

  const lastSets = home?.lastSets ?? {};
  const cur = currentSet(w);
  const left = secondsLeft(w, now);
  const header = <Stack.Screen options={{ title: w.dayName }} />;
  const offline = !synced ? <Body muted>{t("fitness:workout.offline")}</Body> : null;

  // ---- Done for today ----
  if (w.endedAt) {
    const sum = workoutSummary(w);
    const next = home?.routine ? nextDay(home.routine.days, w.dayId) : null;
    const leave = async () => {
      if (synced) await workoutStore.clear(groupId);
      router.replace({ pathname: "/group/[id]", params: { id: groupId } });
    };
    return (
      <FormScroll testID="workout-done" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 14 }}>
        {header}
        <Text style={{ color: c.text, fontSize: 28, fontWeight: "700", textAlign: "center" }}>{t("fitness:workout.doneTitle", { day: w.dayName })}</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Stat label={t("fitness:workout.minutes")} value={t("fitness:home.minutes", { n: sum.minutes })} />
          <Stat label={t("fitness:workout.sets")} value={String(sum.sets)} />
          <Stat label={t("fitness:workout.volume")} value={volumeText(sum.volume)} />
        </View>
        {next ? (
          <Card highlight testID="next-cycle">
            <Body muted>{t("fitness:workout.nextCycle")}</Body>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: "700" }}>{next.name}</Text>
          </Card>
        ) : null}
        {offline}
        <Button label={t("fitness:workout.backToGroup")} onPress={leave} />
      </FormScroll>
    );
  }

  // ---- The exercise list ----
  if (!cur) {
    const done = allDone(w);
    const finish = () => commit(finishWorkout(w, new Date()));
    const cancel = async () => {
      if (!(await confirm(t("fitness:workout.cancelConfirm"), t("fitness:workout.cancelOk"), t("fitness:workout.keep")))) return;
      await cancelRest();
      await fitApi.deleteWorkout(w.id).catch(() => {});
      await workoutStore.clear(groupId);
      router.replace({ pathname: "/group/[id]", params: { id: groupId } });
    };
    const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(w.startedAt).getTime()) / 60_000));
    // The last set of an exercise lands back here: record what was really done.
    const lastSet = w.sets.at(-1);
    const lastEx = lastSet && w.exercises.find((x) => x.id === lastSet.exerciseId);
    return (
      <FormScroll testID="exercise-list" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 12 }}>
        {header}
        <Body muted>{t("fitness:workout.elapsed", { n: elapsed })}</Body>
        {lastSet && lastEx ? (
          <JustDid
            set={lastSet}
            label={t("fitness:workout.justDidOf", { name: lastSet.name, n: lastSet.set })}
            step={lastSet.unit === "lb" ? 5 : 2.5}
            onEdit={(patch) => commit(editLastSet(w, lastSet.exerciseId, patch))}
          />
        ) : null}
        {w.exercises.map((e) => {
          const n = setsDone(w, e.id);
          const finished = exerciseDone(w, e);
          const last = setsText(lastSets[e.id]);
          const today = setsText(w.sets.filter((s) => s.exerciseId === e.id));
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={e.name}
              testID={`exercise-${e.id}`}
              disabled={finished}
              onPress={() => commit(openExercise(w, e.id, new Date()))}
              style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1.5, borderRadius: 24, padding: 18, gap: 4, opacity: finished ? 0.5 : 1 }}
            >
              <Text style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>
                {finished ? "✓ " : ""}
                {e.name}
              </Text>
              <Text style={{ color: c.text }}>
                {t("fitness:workout.progress", { done: n, total: e.sets })} · {targetText(t, { ...e, weight: plannedWeight(w, e) })}
              </Text>
              {today ? <Text testID="today-sets" style={{ color: c.text }}>{t("fitness:workout.today", { sets: today })}</Text> : null}
              {last ? <Text style={{ color: c.muted }}>{t("fitness:workout.last", { sets: last })}</Text> : null}
            </Pressable>
          );
        })}
        {offline}
        {done ? <BigButton label={t("fitness:workout.finish")} onPress={finish} /> : <Button kind="plain" label={t("fitness:workout.finishEarly")} onPress={finish} />}
        <Chip label={t("fitness:workout.cancel")} onPress={cancel} />
      </FormScroll>
    );
  }

  // ---- One exercise: set / timed set / rest ----
  const e = cur.exercise;
  const phase = w.phase!;
  const lastHere = setsText(lastSets[e.id]);
  const lastOfThis: DoneSet | undefined = [...w.sets].reverse().find((s) => s.exerciseId === e.id);
  const justDid = phase.kind === "rest" ? lastOfThis : undefined;
  const isLast = cur.set >= cur.total;
  const weightStep = e.unit === "lb" ? 5 : 2.5;
  return (
    <View testID="exercise-screen" style={{ flex: 1, backgroundColor: c.bg, padding: 20, gap: 14 }}>
      {header}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Chip label={`‹ ${t("fitness:workout.back")}`} onPress={() => commit(closeExercise(w))} />
      </View>
      <Text style={{ color: c.text, fontSize: 24, fontWeight: "700", textAlign: "center" }}>{e.name}</Text>

      {phase.kind === "rest" ? (
        <>
          <Text testID="set-counter" style={{ color: c.muted, fontSize: 22, textAlign: "center" }}>
            {t("fitness:workout.nextSet", { n: cur.set, total: cur.total })}
          </Text>
          <Text accessibilityLabel={t("fitness:workout.rest")} testID="rest-timer" style={{ color: c.text, fontSize: 88, fontWeight: "700", textAlign: "center" }}>
            {restClock(left)}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
            <Chip label={t("fitness:workout.minus15")} onPress={() => commit(adjustRest(w, -15, new Date()))} />
            <Chip label={t("fitness:workout.plus30")} onPress={() => commit(adjustRest(w, 30, new Date()))} />
          </View>
          {justDid ? <JustDid set={justDid} label={t("fitness:workout.justDid", { n: justDid.set })} step={weightStep} onEdit={(patch) => commit(editLastSet(w, e.id, patch))} /> : null}
          <View style={{ flex: 1 }} />
          <BigButton label={t("fitness:workout.skipRest")} height={72} onPress={() => commit(skipRest(w))} />
        </>
      ) : (
        <>
          <Text testID="set-counter" style={{ color: c.text, fontSize: 56, fontWeight: "700", textAlign: "center" }}>
            {t("fitness:workout.setOf", { n: cur.set, total: cur.total })}
          </Text>
          <Text style={{ color: c.text, fontSize: 20, textAlign: "center" }}>{targetText(t, { ...e, weight: plannedWeight(w, e) })}</Text>
          {/* No rest between sets: the set just done can still be fixed here. */}
          {phase.kind === "work" && lastOfThis ? (
            <JustDid set={lastOfThis} label={t("fitness:workout.justDid", { n: lastOfThis.set })} step={weightStep} onEdit={(patch) => commit(editLastSet(w, e.id, patch))} />
          ) : null}
          {lastHere ? <Text style={{ color: c.muted, textAlign: "center" }}>{t("fitness:workout.last", { sets: lastHere })}</Text> : null}
          {e.note ? <Text style={{ color: c.muted, textAlign: "center" }}>{e.note}</Text> : null}
          {phase.kind === "timed" ? (
            <>
              <Text style={{ color: c.muted, fontSize: 20, textAlign: "center" }}>{t("fitness:workout.holding")}</Text>
              <Text testID="timed-timer" style={{ color: c.text, fontSize: 88, fontWeight: "700", textAlign: "center" }}>
                {restClock(left)}
              </Text>
              <View style={{ flex: 1 }} />
              <BigButton label={t("fitness:workout.endEarly")} height={200} onPress={() => commit(completeSet(w, new Date()))} />
            </>
          ) : (
            <>
              <View style={{ flex: 1 }} />
              <BigButton
                testID="set-done"
                height={220}
                label={e.target === "time" ? t("fitness:workout.startTimed", { sec: e.seconds ?? 0 }) : isLast || e.restSec <= 0 ? t("fitness:workout.doneLast") : t("fitness:workout.doneSet")}
                onPress={() => commit(e.target === "time" ? startTimed(w, new Date()) : completeSet(w, new Date()))}
              />
            </>
          )}
        </>
      )}
      {offline}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 18, padding: 12, gap: 2 }}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

function Stepper({ value, less, more, onChange }: { value: string; less: string; more: string; onChange: (d: number) => void }) {
  const c = useColors();
  const btn = (label: string, sign: string, d: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onChange(d)}
      hitSlop={8}
      style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.pinkSoft, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: c.text, fontSize: 26, fontWeight: "700" }}>{sign}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      {btn(less, "−", -1)}
      <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{value}</Text>
      {btn(more, "+", 1)}
    </View>
  );
}

/** −/+ by a plate step, or type it in. 0 / empty = bodyweight. */
function WeightStepper({ weight, unit, step, onChange }: { weight: number | null; unit: string; step: number; onChange: (w: number | null) => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const [text, setText] = useState(weight ? String(weight) : "");
  useEffect(() => {
    if ((Number(text) || null) !== weight) setText(weight ? String(weight) : "");
    // Only when it changes from outside (the buttons, the next set).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weight]);
  const btn = (label: string, sign: string, d: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onChange(Math.max(0, (weight ?? 0) + d * step) || null)}
      hitSlop={8}
      style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.pinkSoft, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ color: c.text, fontSize: 26, fontWeight: "700" }}>{sign}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      {btn(t("fitness:workout.lessWeight"), "−", -1)}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
        <TextInput
          accessibilityLabel={t("fitness:workout.weight", { unit })}
          testID="weight-input"
          value={text}
          placeholder={t("fitness:workout.bodyweight")}
          placeholderTextColor={c.muted}
          keyboardType="decimal-pad"
          onChangeText={(s) => {
            const clean = s.replace(/[^\d.]/g, "");
            setText(clean);
            const n = Number(clean);
            onChange(clean && Number.isFinite(n) && n > 0 ? n : null);
          }}
          style={{ color: c.text, fontSize: 24, minWidth: 64, maxWidth: 120, textAlign: "center", borderBottomWidth: 1.5, borderColor: c.border, paddingVertical: 4 }}
        />
        <Text style={{ color: c.text, fontSize: 20 }}>{unit}</Text>
      </View>
      {btn(t("fitness:workout.moreWeight"), "+", 1)}
    </View>
  );
}

/** The set just done, as it really went: reps (or seconds) and the weight used. */
function JustDid({ set, label, step, onEdit }: { set: DoneSet; label: string; step: number; onEdit: (patch: { reps?: number; seconds?: number; weight?: number | null }) => void }) {
  const { t } = useTranslation();
  return (
    <Card testID="just-did">
      <Body muted>{label}</Body>
      {set.seconds != null ? (
        <Stepper
          value={`${set.seconds}s`}
          less={t("fitness:workout.lessTime")}
          more={t("fitness:workout.moreTime")}
          onChange={(d) => onEdit({ seconds: Math.max(0, (set.seconds ?? 0) + d * 5) })}
        />
      ) : (
        <Stepper
          value={t("fitness:workout.reps", { n: set.reps ?? 0 })}
          less={t("fitness:workout.fewerReps")}
          more={t("fitness:workout.moreReps")}
          onChange={(d) => onEdit({ reps: Math.max(0, (set.reps ?? 0) + d) })}
        />
      )}
      <WeightStepper weight={set.weight} unit={set.unit} step={step} onChange={(weight) => onEdit({ weight })} />
    </Card>
  );
}
