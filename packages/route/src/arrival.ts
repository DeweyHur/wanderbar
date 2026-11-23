import { metersBetween } from "./placeSearch";

/**
 * Following the day by where the phone is: what to ask, if anything.
 * - At a stop that isn't the current one: "you're at X — switch to it?" (and, if you'd been at the current
 *   stop already, mark that one done on the way).
 * - Been at the current stop and now well away from it: "left X — mark it done?"
 * Nothing while you're at the current stop, nowhere near anything, or for a question you said "not now" to.
 */
export type ArrivalStop = { id: string; name: string; lat: number | null; lng: number | null; status: "pending" | "current" | "done" | "skipped" };
export type ArrivalPrompt =
  | { kind: "here"; key: string; stop: ArrivalStop; finish: ArrivalStop | null }
  | { kind: "left"; key: string; stop: ArrivalStop };

export const ARRIVAL_NEAR_M = 150;
export const ARRIVAL_LEFT_M = 500;

export function arrivalPrompt(
  stops: ArrivalStop[],
  here: { lat: number; lng: number },
  /** Stops you've been at (within the near radius) during this day. */
  seen: Set<string>,
  dismissed: Set<string>,
  opts: { nearM?: number; leftM?: number } = {},
): ArrivalPrompt | null {
  const nearM = opts.nearM ?? ARRIVAL_NEAR_M;
  const leftM = opts.leftM ?? ARRIVAL_LEFT_M;
  const dist = (s: ArrivalStop) => (s.lat != null && s.lng != null ? metersBetween(here, { lat: s.lat, lng: s.lng }) : Infinity);
  const current = stops.find((s) => s.status === "current") ?? null;
  const atCurrent = current ? dist(current) <= nearM : false;
  if (current && atCurrent) seen.add(current.id);
  if (atCurrent) return null;

  // At another stop still to do (the nearest, if a few are close together).
  const nearby = stops
    .filter((s) => s.status === "pending" && s.id !== current?.id)
    .map((s) => ({ s, m: dist(s) }))
    .filter((x) => x.m <= nearM)
    .sort((a, b) => a.m - b.m)[0];
  if (nearby) {
    seen.add(nearby.s.id);
    const key = `here:${nearby.s.id}`;
    if (!dismissed.has(key)) return { kind: "here", key, stop: nearby.s, finish: current && seen.has(current.id) ? current : null };
  }

  if (current && seen.has(current.id) && dist(current) > leftM) {
    const key = `left:${current.id}`;
    if (!dismissed.has(key)) return { kind: "left", key, stop: current };
  }
  return null;
}
