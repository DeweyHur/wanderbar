/** Place search helpers: distances, US ZIP codes, and the order suggestions are shown in. */

export type Point = { lat: number; lng: number };

/** Great-circle distance in meters. */
export function metersBetween(a: Point, b: Point): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** "350 ft", "0.4 mi", "12 mi" (miles) or "350 m", "1.2 km". */
export function formatPlaceDistance(meters: number, miles: boolean): string {
  if (miles) {
    const mi = meters / 1609.344;
    if (mi < 0.1) return `${Math.round(meters * 3.28084 / 10) * 10} ft`;
    return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return meters < 10000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 1000)} km`;
}

/** A 5-digit US ZIP (ZIP+4 is cut to 5); null otherwise. */
export function usZip(s: string): string | null {
  const m = /^\s*(\d{5})(?:-\d{4})?\s*$/.exec(s);
  return m ? m[1] : null;
}

export type Visited = Point & { key: string; name: string; address: string; googlePlaceId: string };
export type Found = { placeId: string; distanceMeters?: number | null };

/** Places you've been whose name or address matches what's typed, nearest first. */
export function matchVisited<T extends Visited>(visited: T[], query: string, origin: Point | null, limit = 3): (T & { meters: number | null })[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return visited
    .filter((v) => v.name.toLowerCase().includes(q) || v.address.toLowerCase().includes(q))
    .map((v) => ({ ...v, meters: origin && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? metersBetween(origin, v) : null }))
    .sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity))
    .slice(0, limit);
}

/** Google's suggestions nearest first (unknown distances keep Google's order, after the known ones), minus places already shown as visited. */
export function sortFound<T extends Found>(found: T[], skipPlaceIds: Set<string>): T[] {
  return found
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !skipPlaceIds.has(f.placeId))
    .sort((a, b) => (a.f.distanceMeters ?? Infinity) - (b.f.distanceMeters ?? Infinity) || a.i - b.i)
    .map(({ f }) => f);
}
