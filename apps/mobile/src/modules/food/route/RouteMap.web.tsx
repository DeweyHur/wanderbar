import type { Stop } from "./api";
import type { RouteResult } from "./google";

/** Web: no embedded map yet (needs a browser-restricted Maps JavaScript key); the screen links to Google Maps. */
export function RouteMap(_props: { stops: Stop[]; route: RouteResult | null }) {
  return null;
}
