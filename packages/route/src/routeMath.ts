export type LatLng = [lat: number, lng: number];

/** Decodes a Google encoded polyline into [lat, lng] pairs. */
export function decodePolyline(encoded: string): LatLng[] {
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

/** Routes API durations look like "1234s". */
export function parseDurationSeconds(s?: string | null): number {
  const n = Number((s ?? "").trim().replace(/s$/, ""));
  return Number.isFinite(n) && s ? Math.trunc(n) : 0;
}

/** Rounded to the minute, at least 1 minute. The UI formats these with translated units. */
export function durationParts(seconds: number): { hours: number; minutes: number } {
  const total = Math.max(1, Math.floor((seconds + 30) / 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** 850 -> "850m", 12345 -> "12.3km". */
export const formatDistance = (meters: number) => (meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`);
