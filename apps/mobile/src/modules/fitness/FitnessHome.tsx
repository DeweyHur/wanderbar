import { startWorkout, type RoutineDay, type Workout } from "@wanderbar/route";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Loading, Text, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { useSession } from "@/core/session";
import { SectionTitle } from "@/modules/boardgame/parts";
import { fitApi, newWorkoutId, type FitnessHome as Home } from "./api";
import { weekdayNames, whenText } from "./format";
import { askExact, exactAllowed, restAlarmSupported } from "./restAlarm";
import { workoutStore } from "./store";

/** A fitness group's home: start (or continue) today's workout, this week's attendance, everyone's check-ins. */
export function FitnessHome({ groupId }: { groupId: string }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.id : null;
  const [home, setHome] = useState<Home | null>(null);
  const [local, setLocal] = useState<Workout | null>(null);
  const [dayId, setDayId] = useState<string | null>(null);
  const [exact, setExact] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      workoutStore.load(groupId).then(async (s) => {
        // A finished workout that the server already has is done with.
        if (s?.workout.endedAt && s.synced) {
          await workoutStore.clear(groupId);
          setLocal(null);
        } else setLocal(s?.workout ?? null);
        // Still unsynced (no signal at the gym): try again now.
        if (s && !s.synced) fitApi.saveWorkout(s.workout).then(() => workoutStore.save(groupId, { ...s, synced: true }), () => {});
      });
      fitApi.home(groupId).then(
        (h) => {
          setHome(h);
          setError("");
        },
        (e) => setError(errorText(t, e)),
      );
      if (restAlarmSupported) exactAllowed().then(setExact);
    }, [groupId, t]),
  );

  if (!home) return error ? <ErrorText>{error}</ErrorText> : <Loading />;

  const days = home.routine?.days ?? [];
  const chosen = days.find((d) => d.id === (dayId ?? home.next?.dayId)) ?? days[0];
  const inProgress = local && !local.endedAt ? local : null;

  const openWorkout = () => router.push({ pathname: "/fitness/workout", params: { group: groupId } });

  const start = async (day: RoutineDay) => {
    setBusy(true);
    const w = startWorkout({ id: newWorkoutId(), groupId, day, now: new Date() });
    // Saved on the phone first; the check-in reaches the group as soon as there's signal.
    await workoutStore.save(groupId, { workout: w, synced: false });
    try {
      await fitApi.saveWorkout(w);
      await workoutStore.save(groupId, { workout: w, synced: true });
    } catch {}
    setBusy(false);
    openWorkout();
  };

  /** Started on another device: carry on here with today's exercises from the routine. */
  const resumeServer = async () => {
    const a = home.active!;
    const day = days.find((d) => d.id === a.dayId) ?? { id: a.dayId, name: a.dayName, exercises: [] };
    const w: Workout = { ...startWorkout({ id: a.id, groupId, day, now: new Date(a.startedAt) }), sets: a.sets };
    await workoutStore.save(groupId, { workout: w, synced: true });
    openWorkout();
  };

  const names = weekdayNames(i18n.language);
  return (
    <View style={{ gap: 14 }}>
      {inProgress ? (
        <Card highlight testID="workout-in-progress">
          <Body>{t("fitness:home.inProgress", { day: inProgress.dayName, done: inProgress.sets.length })}</Body>
          <BigButton label={t("fitness:home.resume")} onPress={openWorkout} />
        </Card>
      ) : home.active ? (
        <Card highlight testID="workout-in-progress">
          <Body>{t("fitness:home.inProgress", { day: home.active.dayName, done: home.active.sets.length })}</Body>
          <BigButton label={t("fitness:home.resume")} onPress={resumeServer} />
        </Card>
      ) : chosen ? (
        <Card highlight testID="start-card">
          <Text style={{ color: c.text, fontSize: 24, fontWeight: "700" }}>{t("fitness:home.next", { day: chosen.name })}</Text>
          {home.last ? <Body muted>{t("fitness:home.last", { day: home.last.dayName, when: whenText(home.last.startedAt, i18n.language) })}</Body> : null}
          <BigButton label={t("fitness:home.start")} busy={busy} onPress={() => start(chosen)} />
          {days.length > 1 ? (
            <>
              <Body muted>{t("fitness:home.otherDay")}</Body>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {days.map((d) => (
                  <Chip key={d.id} label={d.name} selected={d.id === chosen.id} onPress={() => setDayId(d.id)} />
                ))}
              </View>
            </>
          ) : null}
        </Card>
      ) : (
        <Card highlight>
          <Body>{t("fitness:home.noRoutine")}</Body>
          <Button label={t("fitness:home.makeRoutine")} onPress={() => router.push({ pathname: "/fitness/routine", params: { group: groupId } })} />
        </Card>
      )}

      {home.routine ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label={t("fitness:home.editRoutine")} onPress={() => router.push({ pathname: "/fitness/routine", params: { group: groupId } })} />
        </View>
      ) : null}

      {!exact ? (
        <Card>
          <Body>{t("fitness:home.exactHint")}</Body>
          <Chip label={t("fitness:home.exactAllow")} onPress={() => askExact().then(setExact)} />
        </Card>
      ) : null}

      <SectionTitle>{t("fitness:home.week")}</SectionTitle>
      <Card testID="week-board">
        <View style={{ flexDirection: "row", paddingLeft: 84, gap: 4 }}>
          {names.map((n, i) => (
            <Text key={i} style={{ width: 20, textAlign: "center", color: c.muted, fontSize: 12 }}>
              {n}
            </Text>
          ))}
        </View>
        {home.week.members.map((m) => (
          <View key={m.userId} testID={`week-${m.name}`} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text numberOfLines={1} style={{ width: 80, color: c.text, fontWeight: m.userId === me ? "700" : "400" }}>
              {m.name}
            </Text>
            {names.map((_, i) => (
              <View
                key={i}
                style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: m.days.includes(i) ? c.pink : c.pinkSoft }}
              />
            ))}
            <Text numberOfLines={1} style={{ marginLeft: 6, color: c.text, flexShrink: 0 }}>{m.goal ? t("fitness:home.goal", { count: m.count, goal: m.goal }) : t("fitness:home.noGoal", { count: m.count })}</Text>
          </View>
        ))}
      </Card>

      <SectionTitle>{t("fitness:home.feed")}</SectionTitle>
      {home.feed.length === 0 ? <Body muted>{t("fitness:home.feedEmpty")}</Body> : null}
      {home.feed.map((f) => (
        <Card key={f.id} testID="checkin">
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "700" }}>
            {f.name} · {f.dayName}
          </Text>
          <Body muted>
            {[whenText(f.startedAt, i18n.language), f.minutes != null ? t("fitness:home.minutes", { n: f.minutes }) : t("fitness:home.working"), t("fitness:home.sets", { count: f.sets })].join(" · ")}
          </Body>
        </Card>
      ))}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

/** The one button that matters, big enough to hit between sets. */
export function BigButton({ label, onPress, busy, testID, height = 96 }: { label: string; onPress: () => void; busy?: boolean; testID?: string; height?: number }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({ minHeight: height, borderRadius: 28, backgroundColor: c.pink, alignItems: "center", justifyContent: "center", padding: 16, opacity: busy ? 0.6 : 1, transform: pressed ? [{ scale: 0.97 }] : [] })}
    >
      <Text style={{ color: c.onPink, fontSize: 24, fontWeight: "700", textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}
