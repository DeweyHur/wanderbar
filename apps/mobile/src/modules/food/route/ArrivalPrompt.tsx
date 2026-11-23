import { arrivalPrompt, type ArrivalPrompt as Prompt } from "@wanderbar/route";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, View } from "react-native";
import { Body, Button, Card, Chip } from "@/components/ui";
import { watchLocation, type Here } from "@/core/location";
import type { Plan, Stop } from "./api";
import { routeApi } from "./api";

// Per route, for this app session: where you've been, and what you said "not now" to.
const memory = new Map<string, { seen: Set<string>; dismissed: Set<string> }>();
const mem = (planId: string) => {
  let m = memory.get(planId);
  if (!m) memory.set(planId, (m = { seen: new Set(), dismissed: new Set() }));
  return m;
};

/**
 * Today's route follows where you are: at another stop → "switch to it?"; left the current one → "mark it
 * done?". Asks; never changes the route by itself.
 */
export function ArrivalPrompt({ plan, onStops }: { plan: Plan; onStops: (stops: Stop[]) => void }) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [busy, setBusy] = useState(false);
  const here = useRef<Here | null>(null);
  const stops = useRef(plan.stops);
  stops.current = plan.stops;

  const check = () => {
    if (!here.current) return;
    const m = mem(plan.id);
    setPrompt(arrivalPrompt(stops.current, here.current, m.seen, m.dismissed));
  };

  useEffect(() => {
    const stop = watchLocation((h) => {
      here.current = h;
      check();
    });
    // Coming back to the app: look again (the phone may have moved while it was closed).
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => {
      stop();
      sub.remove();
    };
  }, [plan.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(check, [plan.stops]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prompt) return null;
  const notNow = () => {
    mem(plan.id).dismissed.add(prompt.key);
    setPrompt(null);
  };
  const yes = async () => {
    setBusy(true);
    try {
      let next = plan.stops;
      if (prompt.kind === "left") next = await routeApi.flow(plan.id, { action: "complete", stopId: prompt.stop.id });
      else {
        if (prompt.finish) next = await routeApi.flow(plan.id, { action: "complete", stopId: prompt.finish.id });
        next = await routeApi.flow(plan.id, { action: "setCurrent", stopId: prompt.stop.id });
      }
      mem(plan.id).dismissed.add(prompt.key);
      setPrompt(null);
      onStops(next);
    } catch {
      notNow();
    } finally {
      setBusy(false);
    }
  };

  const text =
    prompt.kind === "left"
      ? t("food:route.arrival.left", { name: prompt.stop.name })
      : prompt.finish
        ? t("food:route.arrival.hereFinish", { name: prompt.stop.name, prev: prompt.finish.name })
        : t("food:route.arrival.here", { name: prompt.stop.name });
  return (
    <Card highlight testID="arrival-prompt">
      <Body>{text}</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button label={t("food:route.arrival.yes")} busy={busy} onPress={yes} />
        <Chip label={t("food:route.arrival.notNow")} onPress={notNow} />
      </View>
    </Card>
  );
}
