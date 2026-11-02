import { useEffect, useState } from "react";
import type { Stop } from "./api";
import { computeRoute, MAX_ROUTE_POINTS, useGoogleAvailable, type RouteLeg, type RouteResult } from "./google";

/** Stops that take part in the drive: located, not dropped for this trip. */
export const routableStops = (stops: Stop[]) => stops.filter((s) => s.status !== "skipped" && s.lat != null && s.lng != null);

/**
 * Drive times through the route in order (via our API, when the server has a Google key). `legTo` maps a stop to the leg that
 * arrives at it; `remainingSeconds` counts legs into stops that aren't done yet.
 */
export function useRoute(stops: Stop[]) {
  const googleAvailable = useGoogleAvailable();
  const [result, setResult] = useState<RouteResult | null>(null);
  const points = routableStops(stops);
  const key = points.map((s) => `${s.id}:${s.lat},${s.lng}`).join("|");

  useEffect(() => {
    if (!googleAvailable || points.length < 2 || points.length > MAX_ROUTE_POINTS) return setResult(null);
    let cancelled = false;
    computeRoute(points.map((s) => ({ lat: s.lat!, lng: s.lng! })))
      .then((r) => !cancelled && setResult(r))
      .catch(() => !cancelled && setResult(null));
    return () => {
      cancelled = true;
    };
  }, [key, googleAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  const legTo = new Map<string, RouteLeg>();
  if (result) points.slice(1).forEach((s, i) => result.legs[i] && legTo.set(s.id, result.legs[i]));
  const remainingSeconds = result
    ? points.slice(1).reduce((sum, s, i) => (s.status === "done" ? sum : sum + (result.legs[i]?.seconds ?? 0)), 0)
    : 0;
  return { result, legTo, remainingSeconds, points };
}
