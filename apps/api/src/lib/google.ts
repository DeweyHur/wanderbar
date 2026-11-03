import { googlePeriodsToHoursRaw, type GooglePeriod } from "@wanderbar/route";
import { isInMemoryDb } from "../db/client";
import { HttpError } from "./errors";

/**
 * Google Places (New) and Routes, called from the server with a server-only key (GOOGLE_SERVER_KEY,
 * restricted to those two APIs). The apps never see the key; only signed-in users reach these calls.
 */
export type Fetch = typeof fetch;

export type Suggestion = { placeId: string; primary: string; secondary: string };
export type PlaceDetails = {
  googlePlaceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  mapsUrl: string;
  hoursRaw: string;
  /** Google's main type, e.g. "ramen_restaurant" (used to guess a category). */
  primaryType: string;
  /** First photo's resource name (places/…/photos/…), or "". */
  photoName: string;
};
export type RouteLeg = { seconds: number; meters: number; polyline: string };
export type RouteResult = { legs: RouteLeg[]; seconds: number; meters: number };
export type LatLng = { lat: number; lng: number };

/** Origin + 25 intermediates + destination. */
export const MAX_ROUTE_POINTS = 27;

/** End-to-end tests only: canned answers instead of calling Google (needs the in-memory database too). */
export const googleFakeEnabled = (env: Record<string, string | undefined> = process.env) =>
  env.E2E_FAKE_GOOGLE === "1" && (env.DATABASE_URL ?? "").startsWith("pglite:") && env.VERCEL !== "1";

export const googleAvailable = () => googleFakeEnabled() || !!process.env.GOOGLE_SERVER_KEY;

function key() {
  const k = process.env.GOOGLE_SERVER_KEY;
  if (!k) throw new HttpError(503, "google.unavailable");
  return k;
}

async function call<T>(f: Fetch, url: string, init: RequestInit & { fieldMask?: string }): Promise<T> {
  const res = await f(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      ...(init.fieldMask ? { "X-Goog-FieldMask": init.fieldMask } : {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    console.error("[google]", res.status, data.error?.message);
    throw new HttpError(502, "google.failed");
  }
  return data;
}

export async function autocomplete(input: string, sessionToken: string, near: LatLng | null, f: Fetch = fetch): Promise<Suggestion[]> {
  if (googleFakeEnabled()) return fake.autocomplete(input);
  const body: Record<string, unknown> = { input, sessionToken };
  if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } };
  const data = await call<{
    suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[];
  }>(f, "https://places.googleapis.com/v1/places:autocomplete", { method: "POST", body: JSON.stringify(body) });
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ placeId: p.placeId, primary: p.structuredFormat?.mainText?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }));
}

export async function placeDetails(placeId: string, sessionToken: string | null, f: Fetch = fetch): Promise<PlaceDetails> {
  if (googleFakeEnabled()) return fake.details(placeId);
  const q = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const data = await call<{
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    googleMapsUri?: string;
    regularOpeningHours?: { periods?: GooglePeriod[] };
    primaryType?: string;
    photos?: { name: string }[];
  }>(f, `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${q}`, {
    method: "GET",
    fieldMask: "id,displayName,formattedAddress,location,googleMapsUri,regularOpeningHours,primaryType,photos",
  });
  return {
    googlePlaceId: placeId,
    name: data.displayName?.text ?? "",
    address: data.formattedAddress ?? "",
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
    mapsUrl: data.googleMapsUri ?? "",
    hoursRaw: googlePeriodsToHoursRaw(data.regularOpeningHours?.periods),
    primaryType: data.primaryType ?? "",
    photoName: data.photos?.[0]?.name ?? "",
  };
}

/** A short-lived public image URL for a Places photo (the key stays on the server). */
export async function photoUrl(photoName: string, maxWidthPx = 1000, f: Fetch = fetch): Promise<string> {
  if (!/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) throw new HttpError(400, "bad_request");
  if (googleFakeEnabled()) return "/favicon.ico";
  const data = await call<{ photoUri?: string }>(
    f,
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`,
    { method: "GET" },
  );
  if (!data.photoUri) throw new HttpError(404, "not_found");
  return data.photoUri;
}

/**
 * The Google place for "name, address" (a Yelp share, a typed-in restaurant), or null.
 * Asks only for ids, the cheapest Text Search tier; details come from placeDetails.
 */
export async function findPlaceId(query: string, near: LatLng | null, f: Fetch = fetch): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  if (googleFakeEnabled()) return fake.find(q);
  const body: Record<string, unknown> = { textQuery: q, pageSize: 1 };
  if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } };
  const data = await call<{ places?: { id: string }[] }>(f, "https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    fieldMask: "places.id",
    body: JSON.stringify(body),
  });
  return data.places?.[0]?.id ?? null;
}

const parseSeconds = (s?: string) => Math.trunc(Number((s ?? "0").replace(/s$/, "")) || 0);

/** Driving with traffic through every point in order. */
export async function computeRoute(points: LatLng[], f: Fetch = fetch): Promise<RouteResult> {
  if (points.length < 2 || points.length > MAX_ROUTE_POINTS) throw new HttpError(400, "route.points");
  if (googleFakeEnabled()) return fake.route(points);
  const wp = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const data = await call<{ routes?: { legs?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[] }[] }>(
    f,
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      fieldMask: "routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline.encodedPolyline",
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
    seconds: parseSeconds(l.duration),
    meters: l.distanceMeters ?? 0,
    polyline: l.polyline?.encodedPolyline ?? "",
  }));
  if (!legs.length) throw new HttpError(404, "route.not_found");
  return { legs, seconds: legs.reduce((a, l) => a + l.seconds, 0), meters: legs.reduce((a, l) => a + l.meters, 0) };
}

/** Deterministic stand-ins used by the end-to-end tests. */
const FAKE_PLACES: PlaceDetails[] = [
  { googlePlaceId: "fake-blue-bottle", name: "Blue Bottle Coffee", address: "315 Linden St, San Francisco, CA 94102", lat: 37.7764, lng: -122.4231, mapsUrl: "https://maps.google.com/?cid=1", hoursRaw: "24h", primaryType: "coffee_shop", photoName: "places/fake-blue-bottle/photos/p1" },
  { googlePlaceId: "fake-ggp", name: "Golden Gate Park", address: "San Francisco, CA", lat: 37.7694, lng: -122.4862, mapsUrl: "https://maps.google.com/?cid=2", hoursRaw: "24h", primaryType: "park", photoName: "" },
  { googlePlaceId: "fake-sfjazz", name: "SFJAZZ Center", address: "201 Franklin St, San Francisco, CA 94102", lat: 37.7763, lng: -122.4213, mapsUrl: "https://maps.google.com/?cid=3", hoursRaw: "Mon-Sun 17:00-23:00", primaryType: "concert_hall", photoName: "" },
  { googlePlaceId: "fake-mensho", name: "Mensho Tokyo", address: "672 Geary St, San Francisco, CA 94102", lat: 37.7866, lng: -122.4146, mapsUrl: "https://maps.google.com/?cid=4", hoursRaw: "Mon-Sun 11:30-22:00", primaryType: "ramen_restaurant", photoName: "places/fake-mensho/photos/p1" },
];
/** What the fake short-link server answers (yelp.to / maps.app.goo.gl → canonical). */
export const FAKE_SHORT_LINKS: Record<string, string> = {
  "https://yelp.to/mensho": "https://www.yelp.com/biz/mensho-tokyo-san-francisco?utm_source=ishare",
  "https://maps.app.goo.gl/mensho": "https://www.google.com/maps/place/Mensho+Tokyo/@37.7866,-122.4146,17z",
};
const fake = {
  autocomplete: (input: string): Suggestion[] =>
    FAKE_PLACES.filter((p) => p.name.toLowerCase().includes(input.trim().toLowerCase())).map((p) => ({
      placeId: p.googlePlaceId,
      primary: p.name,
      secondary: p.address,
    })),
  find: (q: string): string | null => {
    const s = q.toLowerCase();
    return FAKE_PLACES.find((p) => s.includes(p.name.toLowerCase()))?.googlePlaceId ?? null;
  },
  details: (id: string): PlaceDetails => {
    const p = FAKE_PLACES.find((x) => x.googlePlaceId === id);
    if (!p) throw new HttpError(404, "not_found");
    return p;
  },
  route: (points: LatLng[]): RouteResult => {
    const legs = points.slice(1).map(() => ({ seconds: 600, meters: 3000, polyline: "" }));
    return { legs, seconds: legs.length * 600, meters: legs.length * 3000 };
  },
};

export { isInMemoryDb };
