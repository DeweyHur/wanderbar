import { yelpAlias } from "@wanderbar/route";
import { googleFakeEnabled, type Fetch } from "./google";

/**
 * Finds a restaurant's own Yelp page through the Yelp Places (Fusion) API, so the Yelp button opens the
 * business instead of a search. Optional: only with YELP_API_KEY (Yelp charges per call). Never scrapes.
 */
export const yelpAvailable = () => googleFakeEnabled() || !!process.env.YELP_API_KEY;

const FAKE: Record<string, string> = {
  "blue bottle coffee": "https://www.yelp.com/biz/blue-bottle-coffee-san-francisco-8",
  "mensho tokyo": "https://www.yelp.com/biz/mensho-tokyo-san-francisco",
};

/** The business page URL (without tracking parameters) nearest to the coordinates with that name, or null. */
export async function findYelpUrl(name: string, near: { lat: number; lng: number }, f: Fetch = fetch): Promise<string | null> {
  if (googleFakeEnabled()) return FAKE[name.trim().toLowerCase()] ?? null;
  const key = process.env.YELP_API_KEY;
  if (!key || !name.trim()) return null;
  const q = new URLSearchParams({ term: name.trim(), latitude: String(near.lat), longitude: String(near.lng), radius: "300", limit: "1", sort_by: "best_match" });
  try {
    const res = await f(`https://api.yelp.com/v3/businesses/search?${q}`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" } });
    if (!res.ok) {
      console.error("[yelp]", res.status);
      return null;
    }
    const data = (await res.json()) as { businesses?: { url?: string }[] };
    const url = data.businesses?.[0]?.url?.split(/[?#]/)[0] ?? null;
    return url && yelpAlias(url) ? url : null;
  } catch {
    return null; // Yelp trouble never blocks saving
  }
}
