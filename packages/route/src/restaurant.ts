/**
 * Food-module rules shared by the app and the API: duplicate keys from shared links, categories, prices.
 */

/** yelp.com/biz/<alias> → alias (lowercase, decoded). Null for anything else, including yelp.to short links. */
export function yelpAlias(url: string): string | null {
  const m = /^https?:\/\/(?:[a-z]+\.)?yelp\.[a-z.]+\/biz\/([^/?#]+)/i.exec(url.trim());
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}

/** Short links the server follows to get the canonical address (yelp.to/…, maps.app.goo.gl/…, goo.gl/maps/…). */
export function isShortLink(url: string): boolean {
  return /^https?:\/\/(yelp\.to|maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(url.trim());
}

/** Category ids of the food module. Stored as-is; screens show `food:category.<id>`. */
export const FOOD_CATEGORIES = [
  "korean",
  "japanese",
  "chinese",
  "vietnamese",
  "thai",
  "indian",
  "mexican",
  "italian",
  "american",
  "burger",
  "pizza",
  "seafood",
  "bbq",
  "cafe",
  "bakery",
  "dessert",
  "bar",
  "other",
] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];
export const isFoodCategory = (s: unknown): s is FoodCategory => typeof s === "string" && (FOOD_CATEGORIES as readonly string[]).includes(s);

/** A first guess from Google's place type (e.g. "ramen_restaurant" → japanese). Null when it says nothing useful. */
export function categoryFromGoogleType(type: string | null | undefined): FoodCategory | null {
  if (!type) return null;
  const t = type.toLowerCase();
  const table: [RegExp, FoodCategory][] = [
    [/^korean/, "korean"],
    [/^(japanese|ramen|sushi)/, "japanese"],
    [/^chinese/, "chinese"],
    [/^vietnamese/, "vietnamese"],
    [/^thai/, "thai"],
    [/^indian/, "indian"],
    [/^mexican/, "mexican"],
    [/^italian/, "italian"],
    [/^american/, "american"],
    [/^hamburger/, "burger"],
    [/^pizza/, "pizza"],
    [/^seafood/, "seafood"],
    [/^barbecue/, "bbq"],
    [/^(cafe|coffee_shop|tea_house)/, "cafe"],
    [/^bakery/, "bakery"],
    [/^(dessert|ice_cream|confectionery|donut)/, "dessert"],
    [/^(bar|pub|wine_bar|cocktail_bar|night_club)$/, "bar"],
  ];
  return table.find(([re]) => re.test(t))?.[1] ?? null;
}

/** Fraction digits of a currency (USD 2, KRW 0, JPY 0). */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** "12.5" / "12,000" / "₩9,000" → minor units (1250 / 12000). Null when there is no number in it. */
export function parsePrice(input: string, currency: string): number | null {
  const cleaned = input.replace(/[^\d.]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const value = Number(cleaned.split(".").slice(0, 2).join("."));
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10 ** currencyDigits(currency));
}

/** Minor units → the plain number to edit ("12.50", "9000"). */
export const priceInput = (minor: number, currency: string) => {
  const d = currencyDigits(currency);
  return (minor / 10 ** d).toFixed(d);
};

/** Minor units → "$12.50" / "$14" / "₩9,000" in the reader's language (no ".00" on whole amounts). */
export function formatPrice(minor: number, currency: string, locale?: string): string {
  const d = currencyDigits(currency);
  const digits = minor % 10 ** d === 0 ? 0 : d;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** d);
  } catch {
    return `${(minor / 10 ** d).toFixed(d)} ${currency}`;
  }
}

/** "…/maps/place/Name/@37.7866,-122.4146,17z" (or ?q=37.78,-122.41) → coordinates, to search near them. */
export function coordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  const m = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(url) ?? /[?&](?:q|query|ll)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(url);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
