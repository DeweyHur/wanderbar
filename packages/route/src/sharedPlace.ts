import { parseSharedText } from "./sharedText";

export type ParsedPlace = { name: string; address: string; mapsUrl: string; yelpUrl: string; source: "gmaps" | "yelp" | "other" };

const isYelp = (u: string) => /(^|\.)yelp\.(com|to|ca|co\.uk)\b|\/\/yelp\.to\//i.test(u);
const isGoogleMaps = (u: string) => /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\./i.test(u);

/** "Check out Blue Bottle Coffee on Yelp!" → "Blue Bottle Coffee" (Yelp prefixes its shares with a sentence). */
function yelpName(line: string) {
  return line
    .replace(/^check out\s+/i, "")
    .replace(/\s+on yelp!?\.?$/i, "")
    .replace(/^옐프에서\s+/, "")
    .replace(/\s*(을|를)?\s*확인해\s*보세요!?$/, "")
    .trim();
}

/** Turns shared text from Google Maps, Yelp or anything else into a place to add. */
export function parseSharedPlace(text: string, title?: string | null): ParsedPlace {
  const p = parseSharedText(text, title);
  const url = p.mapsUrl ?? "";
  if (url && isYelp(url)) {
    const name = yelpName(title ?? "") || yelpName(p.name);
    return { name, address: title ? p.address : "", mapsUrl: "", yelpUrl: url, source: "yelp" };
  }
  return { name: p.name, address: p.address, mapsUrl: url, yelpUrl: "", source: url && isGoogleMaps(url) ? "gmaps" : "other" };
}
