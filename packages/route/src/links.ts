/** Same encoding as Java's URLEncoder (form encoding): spaces as "+", and !'()~ escaped. */
const enc = (s: string) =>
  encodeURIComponent(s)
    .replace(/%20/g, "+")
    .replace(/[!'()~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/** What we search for: "name, address" when both exist. */
export const placeQuery = (name: string, address?: string | null) =>
  [name.trim(), (address ?? "").trim()].filter(Boolean).join(", ");

export const Links = {
  /** Google Maps driving directions from the current location (to the exact place when its id is known). */
  googleDirections: (name: string, address?: string | null, placeId?: string | null) =>
    `https://www.google.com/maps/dir/?api=1&destination=${enc(placeQuery(name, address))}&travelmode=driving` +
    (placeId ? `&destination_place_id=${enc(placeId)}` : ""),

  /** The place's own page in Google Maps: by place id when known, else the saved Maps link, else a search. */
  googlePlace: (name: string, address?: string | null, placeId?: string | null, mapsUrl?: string | null) =>
    placeId
      ? `https://www.google.com/maps/search/?api=1&query=${enc(placeQuery(name, address))}&query_place_id=${enc(placeId)}`
      : (mapsUrl ?? "").trim() || `https://www.google.com/maps/search/?api=1&query=${enc(placeQuery(name, address))}`,

  /** Google Maps place search (used when no shared Maps link exists). */
  googleSearch: (name: string, address?: string | null) =>
    `https://www.google.com/maps/search/?api=1&query=${enc(placeQuery(name, address))}`,

  /** Yelp search. The address, when present, narrows the location. */
  yelpSearch: (name: string, address?: string | null) => {
    const base = `https://www.yelp.com/search?find_desc=${enc(name.trim())}`;
    const loc = (address ?? "").trim();
    return loc ? `${base}&find_loc=${enc(loc)}` : base;
  },
};

/**
 * Ways to phrase a destination for the Tesla app. Which one it accepts is checked on the car with the
 * format tester. Known so far: Android's Tesla app rejected the 3-line "full" text, so "address" is the default.
 */
export const TESLA_FORMATS = ["address", "nameAddress", "coords", "link", "full"] as const;
export type TeslaFormat = (typeof TESLA_FORMATS)[number];
export const DEFAULT_TESLA_FORMAT: TeslaFormat = "address";

export type Destination = { name: string; address?: string | null; mapsUrl?: string | null; lat?: number | null; lng?: number | null };

/** Text handed to the Tesla app, or null when the format can't be built for this place (e.g. no coordinates). */
export function teslaShareText(format: TeslaFormat, p: Destination): string | null {
  const n = p.name.trim();
  const a = (p.address ?? "").trim();
  const url = (p.mapsUrl ?? "").trim();
  switch (format) {
    case "address":
      return a || n || null;
    case "nameAddress":
      return placeQuery(n, a) || null;
    case "coords":
      return p.lat != null && p.lng != null ? `${p.lat.toFixed(6)},${p.lng.toFixed(6)}` : null;
    case "link":
      return url || Links.googleSearch(n, a);
    case "full":
      return [n, a, url || Links.googleSearch(n, a)].filter(Boolean).join("\n");
  }
}

/** The preferred format, falling back through the others when it can't be built for this place. */
export function teslaShareTextWithFallback(preferred: TeslaFormat, p: Destination): string {
  for (const f of [preferred, ...TESLA_FORMATS]) {
    const t = teslaShareText(f, p);
    if (t) return t;
  }
  return p.name;
}
