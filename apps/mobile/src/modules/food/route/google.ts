import { decodePolyline, googlePeriodsToHoursRaw, parseDurationSeconds, type GooglePeriod, type LatLng } from "@wanderbar/route";
import { Platform } from "react-native";

/**
 * Google Places (New) and Routes, called directly from the Android app with the Android-restricted key
 * (the X-Android-* headers let a restricted key work for REST calls), exactly like the old Kotlin app.
 * iOS and the web need their own keys; until then search, drive times and Google map tiles are off there.
 */
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? "";
const PACKAGE = "app.wanderbar.mobile";
// SHA-1 of the signing key (Expo template debug keystore used for these builds), without colons.
const CERT = (process.env.EXPO_PUBLIC_ANDROID_CERT_SHA1 ?? "5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25").replace(/:/g, "");

export const googleAvailable = Platform.OS === "android" && KEY.length > 0;

const headers = (fieldMask?: string): Record<string, string> => ({
  "Content-Type": "application/json",
  "X-Goog-Api-Key": KEY,
  "X-Android-Package": PACKAGE,
  "X-Android-Cert": CERT,
  ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
});

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Google ${res.status}`);
  return data;
}

// One session token per search-and-pick, which Google bills as a single session.
const newSession = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("");
let session = newSession();

export type Suggestion = { placeId: string; primary: string; secondary: string };
export type PlaceDetails = { googlePlaceId: string; name: string; address: string; lat: number | null; lng: number | null; mapsUrl: string; hoursRaw: string };

export async function suggestPlaces(input: string, near?: { lat: number; lng: number } | null): Promise<Suggestion[]> {
  if (!googleAvailable || !input.trim()) return [];
  const body: Record<string, unknown> = { input, sessionToken: session };
  if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } };
  const data = await call<{
    suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[];
  }>("https://places.googleapis.com/v1/places:autocomplete", { method: "POST", headers: headers(), body: JSON.stringify(body) });
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ placeId: p.placeId, primary: p.structuredFormat?.mainText?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }));
}

export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  const data = await call<{
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    googleMapsUri?: string;
    regularOpeningHours?: { periods?: GooglePeriod[] };
  }>(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${session}`, {
    headers: headers("id,displayName,formattedAddress,location,googleMapsUri,regularOpeningHours"),
  });
  session = newSession();
  return {
    googlePlaceId: placeId,
    name: data.displayName?.text ?? "",
    address: data.formattedAddress ?? "",
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
    mapsUrl: data.googleMapsUri ?? "",
    hoursRaw: googlePeriodsToHoursRaw(data.regularOpeningHours?.periods),
  };
}

export type RouteLeg = { seconds: number; meters: number; path: LatLng[] };
export type RouteResult = { legs: RouteLeg[]; seconds: number; meters: number };

/** Origin + 25 intermediates + destination. */
export const MAX_ROUTE_POINTS = 27;
const routeCache = new Map<string, RouteResult>();

/** Driving with traffic through every point in order. Cached per exact list of coordinates. */
export async function computeRoute(points: { lat: number; lng: number }[]): Promise<RouteResult | null> {
  if (!googleAvailable || points.length < 2 || points.length > MAX_ROUTE_POINTS) return null;
  const key = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  const hit = routeCache.get(key);
  if (hit) return hit;
  const wp = (p: { lat: number; lng: number }) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const data = await call<{ routes?: { legs?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[] }[] }>(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: headers("routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline"),
      body: JSON.stringify({
        origin: wp(points[0]),
        destination: wp(points[points.length - 1]),
        intermediates: points.slice(1, -1).map(wp),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    },
  );
  const legs = (data.routes?.[0]?.legs ?? []).map((l) => ({
    seconds: parseDurationSeconds(l.duration),
    meters: l.distanceMeters ?? 0,
    path: decodePolyline(l.polyline?.encodedPolyline ?? ""),
  }));
  if (!legs.length) return null;
  const result = { legs, seconds: legs.reduce((a, l) => a + l.seconds, 0), meters: legs.reduce((a, l) => a + l.meters, 0) };
  if (routeCache.size > 20) routeCache.delete(routeCache.keys().next().value!);
  routeCache.set(key, result);
  return result;
}
