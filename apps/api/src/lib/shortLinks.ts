import { isShortLink } from "@wanderbar/route";
import { FAKE_SHORT_LINKS, googleFakeEnabled, type Fetch } from "./google";

/**
 * Follows yelp.to / maps.app.goo.gl short links to the canonical address (the Yelp alias and the Google
 * coordinates live there). Only these hosts are followed, so the server can't be pointed at anything else.
 * Never reads page content (Yelp terms): only the Location header of each redirect.
 */
const ALLOWED = /^(yelp\.to|(?:[a-z]+\.)?yelp\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|(?:www\.|maps\.)?google\.[a-z.]+)$/i;
const MAX_HOPS = 5;

export async function resolveShortLink(url: string, f: Fetch = fetch): Promise<string> {
  const start = url.trim();
  if (!isShortLink(start)) return start;
  if (googleFakeEnabled()) return FAKE_SHORT_LINKS[start] ?? start;
  let current = start;
  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const u = new URL(current);
      // Not ours to fetch: hand back what we have (reading the address itself is harmless).
      if (u.protocol !== "https:" || !ALLOWED.test(u.hostname)) return current;
      const res = await f(current, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000) });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      await res.body?.cancel().catch(() => {});
      if (!next) return current;
      current = new URL(next, current).toString();
    }
  } catch {
    return start;
  }
  return current;
}
