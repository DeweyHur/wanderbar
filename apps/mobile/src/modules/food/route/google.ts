import { decodePolyline, type LatLng } from "@wanderbar/route";
import { useEffect, useState } from "react";
import { api } from "@/core/api";

/**
 * Place search and drive times go through our API, which holds the Google key (server-side only).
 * Works the same on iOS, Android and the web; off when the server has no Google key.
 */
let availability: Promise<boolean> | null = null;
export function googleAvailableAsync() {
  availability ??= api<{ googlePlaces: boolean }>("/api/config")
    .then((c) => c.googlePlaces)
    .catch(() => {
      availability = null; // try again next time
      return false;
    });
  return availability;
}

export function useGoogleAvailable() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    googleAvailableAsync().then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

// One session token per search-and-pick, which Google bills as a single session.
const newSession = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("");
let session = newSession();

export type Suggestion = { placeId: string; primary: string; secondary: string };
export type PlaceDetails = { googlePlaceId: string; name: string; address: string; lat: number | null; lng: number | null; mapsUrl: string; hoursRaw: string };

export async function suggestPlaces(input: string, near?: { lat: number; lng: number } | null): Promise<Suggestion[]> {
  if (!input.trim()) return [];
  const r = await api<{ suggestions: Suggestion[] }>("/api/places/autocomplete", { body: { input, sessionToken: session, near: near ?? null } });
  return r.suggestions;
}

export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  const d = await api<PlaceDetails>(`/api/places/${encodeURIComponent(placeId)}?sessionToken=${session}`);
  session = newSession();
  return d;
}

export type RouteLeg = { seconds: number; meters: number; path: LatLng[] };
export type RouteResult = { legs: RouteLeg[]; seconds: number; meters: number };

/** Origin + 25 intermediates + destination. */
export const MAX_ROUTE_POINTS = 27;
const routeCache = new Map<string, RouteResult>();

/** Driving with traffic through every point in order. Cached per exact list of coordinates. */
export async function computeRoute(points: { lat: number; lng: number }[]): Promise<RouteResult | null> {
  if (points.length < 2 || points.length > MAX_ROUTE_POINTS) return null;
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  const hit = routeCache.get(key);
  if (hit) return hit;
  const r = await api<{ legs: { seconds: number; meters: number; polyline: string }[]; seconds: number; meters: number }>("/api/routes", {
    body: { points },
  });
  const result = { ...r, legs: r.legs.map((l) => ({ seconds: l.seconds, meters: l.meters, path: decodePolyline(l.polyline) })) };
  if (routeCache.size > 20) routeCache.delete(routeCache.keys().next().value!);
  routeCache.set(key, result);
  return result;
}
