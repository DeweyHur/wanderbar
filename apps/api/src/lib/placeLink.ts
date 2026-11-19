import { coordsFromMapsUrl, isShortLink, placeQuery } from "@wanderbar/route";
import { findPlaceId, googleAvailable, placeDetails, type PlaceDetails } from "./google";
import { resolveShortLink } from "./shortLinks";

/**
 * The place a shared Google Maps link points at, so the share screen can fill in the address before saving.
 * The short link is followed to the full Maps address (its coordinates), then the shared name is looked up
 * near there. Null when Google isn't set up or nothing matches.
 */
export async function placeFromLink(url: string, name: string): Promise<PlaceDetails | null> {
  if (!googleAvailable()) return null;
  const link = url.trim();
  if (!/^https:\/\//i.test(link)) return null;
  try {
    const resolved = isShortLink(link) ? await resolveShortLink(link) : link;
    const near = coordsFromMapsUrl(resolved);
    // The full address often names the place too: /maps/place/Mensho+Tokyo/@…
    const named = /\/maps\/place\/([^/@?]+)/.exec(resolved)?.[1];
    const query = name.trim() || (named ? decodeURIComponent(named.replace(/\+/g, " ")) : "");
    const id = await findPlaceId(placeQuery(query, ""), near);
    if (!id) return null;
    const d = await placeDetails(id, null);
    return { ...d, mapsUrl: link };
  } catch {
    return null;
  }
}
