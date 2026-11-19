import type { Stop } from "./api";

/**
 * One pin on a route map: a stop (numbered, coloured by status), a hotel, or one of the group's places
 * that could go on the route.
 */
export type MapMark = {
  key: string;
  lat: number;
  lng: number;
  title: string;
  kind: "stop" | "hotel" | "place";
  /** Stops: position on the route (1-based) and status. */
  n?: number;
  status?: Stop["status"];
};

export const MARK_COLORS = { current: "#2F6FED", pending: "#E8590C", done: "#1F8A5B", skipped: "#999999", hotel: "#7048E8", place: "#D4618B" } as const;

export const markColor = (m: MapMark) => (m.kind === "stop" ? MARK_COLORS[m.status ?? "pending"] : MARK_COLORS[m.kind]);

/** The box around the pins, padded a little; null when nothing has a location. */
export function markRegion(marks: { lat: number; lng: number }[]) {
  if (!marks.length) return null;
  const lats = marks.map((m) => m.lat);
  const lngs = marks.map((m) => m.lng);
  return { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lngs), east: Math.max(...lngs) };
}
