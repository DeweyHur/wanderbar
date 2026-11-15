/**
 * Real-estate module: open-house visits, shared by the app and the API.
 * Listing links (Zillow, Redfin, Realtor.com) carry the address in the URL itself, so a pasted or
 * shared link becomes an address without fetching the page (their terms forbid automated access).
 */

export type ListingSource = "zillow" | "redfin" | "realtor";
export type ListingAddress = {
  source: ListingSource;
  /** The listing link as given (tracking parameters removed). */
  url: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  /** "1234 W Main St, Torrance, CA 90501" */
  address: string;
};

/** Where the house is in our own process (separate from the market's Active / Pending / Sold). */
export const STAGES = ["interested", "to_tour", "toured", "considering", "offered", "contract", "rejected"] as const;
export type Stage = (typeof STAGES)[number];
/** Spaces a tour photo can be filed under. */
export const ROOMS = ["exterior", "living", "kitchen", "bedroom", "bathroom", "yard", "garage", "neighborhood", "other"] as const;
export type Room = (typeof ROOMS)[number];
/** 1–5 scores a tour can give (the house, then the location). */
export const SCORE_KEYS = ["light", "layout", "kitchen", "storage", "bathroom", "condition", "outdoor", "noise", "neighborhood", "parking"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
/** Yes / no things to notice. true = there is one (for worries: there is a worry). */
export const CHECK_KEYS = ["ac", "laundry", "garage", "roofWorry", "foundationWorry", "smellDamp"] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];
/** After a tour: want to see it again / once was enough / out. */
export const QUICK = ["again", "once", "reject"] as const;
export type Quick = (typeof QUICK)[number];

export const RE_LIMITS = { address: 200, text: 2000, note: 300, price: 100_000_000, sqft: 1_000_000, beds: 50 } as const;

const STREET_SUFFIX = new Set(
  "st street ave avenue blvd boulevard dr drive rd road ln lane way ct court pl place cir circle ter terrace pkwy parkway hwy highway trl trail sq square loop aly walk row pt plz plaza crk xing".split(" "),
);
const UNIT_WORD = /^(apt|unit|ste|suite|#|spc|space|bldg|fl)$/i;

const titleWord = (w: string) => (/^[NSEW]{1,2}$/i.test(w) || /^\d/.test(w) || /^[A-Z]{2,}$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
const words = (s: string) => s.split(/[-\s]+/).filter(Boolean);
const joinAddress = (street: string, city: string, state: string, zip: string) => `${street}, ${city}, ${state}${zip ? ` ${zip}` : ""}`;

/** The first http(s) link in shared text ("Check out this home on Zillow: https://…"). */
export function firstUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"')]+/i.exec(text);
  return m ? m[0].replace(/[.,;!?]+$/, "") : null;
}

/** Splits "1234-W-Main-St-Apt-5-Culver-City" into street and city at the street's last suffix/unit. */
function splitStreetCity(tokens: string[]): { street: string[]; city: string[] } | null {
  let end = -1;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (STREET_SUFFIX.has(tokens[i].toLowerCase()) && i > 0) end = i;
  }
  if (end < 0) return null;
  // A unit right after the suffix ("Apt 5", "#5", "Unit B") belongs to the street.
  if (end + 2 < tokens.length && UNIT_WORD.test(tokens[end + 1])) end += 2;
  else if (end + 1 < tokens.length - 1 && /^#\w+$/.test(tokens[end + 1])) end += 1;
  return { street: tokens.slice(0, end + 1), city: tokens.slice(end + 1) };
}

/** Scheme, host and path of a link (query and fragment dropped). No URL global: this package runs anywhere. */
function clean(raw: string): { hostname: string; pathname: string; href: string } | null {
  const m = /^(https?):\/\/([^/?#\s]+)([^?#\s]*)/i.exec(raw.trim());
  if (!m) return null;
  const hostname = m[2].toLowerCase().replace(/:\d+$/, "");
  const pathname = m[3] || "/";
  return { hostname, pathname, href: `${m[1].toLowerCase()}://${m[2]}${pathname}` };
}

/** Reads the address out of a Zillow, Redfin or Realtor.com listing link. Null when it isn't one or has no address. */
export function parseListingUrl(text: string): ListingAddress | null {
  const raw = firstUrl(text) ?? text;
  const u = clean(raw);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  let decoded = u.pathname;
  try {
    decoded = decodeURIComponent(u.pathname);
  } catch {
    /* keep as is */
  }
  const path = decoded.split("/").filter(Boolean);
  const url = u.href;

  if (host === "zillow.com") {
    // /homedetails/1234-W-Main-St-Torrance-CA-90501/12345678_zpid/
    const i = path.indexOf("homedetails");
    const slug = i >= 0 ? path[i + 1] : undefined;
    if (!slug) return null;
    const t = words(slug);
    const zip = /^\d{5}$/.test(t[t.length - 1] ?? "") ? t.pop()! : "";
    const state = /^[A-Z]{2}$/i.test(t[t.length - 1] ?? "") ? t.pop()!.toUpperCase() : "";
    if (!state) return null;
    const parts = splitStreetCity(t);
    if (!parts || !parts.city.length) return null;
    const street = parts.street.map(titleWord).join(" ");
    const city = parts.city.map(titleWord).join(" ");
    return { source: "zillow", url, street, city, state, zip, address: joinAddress(street, city, state, zip) };
  }

  if (host === "redfin.com") {
    // /CA/Torrance/1234-Main-St-90501/home/12345678  (or …/1234-Main-St-90501/unit-5/home/…)
    if (path.length < 3 || !/^[A-Z]{2}$/i.test(path[0])) return null;
    const state = path[0].toUpperCase();
    const city = words(path[1]).map(titleWord).join(" ");
    const t = words(path[2]);
    const zip = /^\d{5}$/.test(t[t.length - 1] ?? "") ? t.pop()! : "";
    if (!t.length || !/^\d/.test(t[0])) return null;
    const unit = /^unit-(.+)$/i.exec(path[3] ?? "")?.[1];
    const street = [...t.map(titleWord), ...(unit ? ["Unit", unit.toUpperCase()] : [])].join(" ");
    return { source: "redfin", url, street, city, state, zip, address: joinAddress(street, city, state, zip) };
  }

  if (host === "realtor.com") {
    // /realestateandhomes-detail/1234-Main-St_Torrance_CA_90501_M12345-67890
    const i = path.indexOf("realestateandhomes-detail");
    const slug = i >= 0 ? path[i + 1] : undefined;
    if (!slug) return null;
    const [s, c, st, z] = slug.split("_");
    if (!s || !c || !st || !/^[A-Z]{2}$/i.test(st)) return null;
    const street = words(s).map(titleWord).join(" ");
    const city = words(c).map(titleWord).join(" ");
    const zip = /^\d{5}$/.test(z ?? "") ? z : "";
    return { source: "realtor", url, street, city, state: st.toUpperCase(), zip, address: joinAddress(street, city, st.toUpperCase(), zip) };
  }
  return null;
}

/** Which listing site a link is from (for the link chip), or null. */
export function listingSource(url: string): ListingSource | null {
  const u = clean(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  return host === "zillow.com" ? "zillow" : host === "redfin.com" ? "redfin" : host === "realtor.com" ? "realtor" : null;
}

const ABBR: Record<string, string> = {
  street: "st", avenue: "ave", boulevard: "blvd", drive: "dr", road: "rd", lane: "ln", court: "ct", place: "pl",
  circle: "cir", terrace: "ter", parkway: "pkwy", highway: "hwy", trail: "trl", square: "sq",
  north: "n", south: "s", east: "e", west: "w", apartment: "apt", suite: "ste", "#": "unit", apt: "unit",
};

/**
 * One key per house within a group: "1234 West Main Street, Torrance, CA 90501, USA" and
 * "1234 W Main St, Torrance, CA 90501" are the same house.
 */
export function addressKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/,?\s*(usa|united states)\s*$/, "")
    .replace(/#\s*/g, " unit ")
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBR[w] ?? w)
    .join(" ");
}

/** Price per square foot, rounded; null when either is missing. */
export const pricePerSqft = (price: number | null | undefined, sqft: number | null | undefined) => (price && sqft ? Math.round(price / sqft) : null);

/** Average of the scores given (ignores blanks), one decimal; null when none. */
export function scoreAverage(scores: Partial<Record<string, number | null>>): number | null {
  const v = Object.values(scores).filter((x): x is number => typeof x === "number" && x >= 1 && x <= 5);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}
