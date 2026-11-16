import { APP_STORES, minAppVersion } from "@/lib/appGate";
import { bggAvailable } from "@/lib/bgg";
import { googleAvailable } from "@/lib/google";
import { json } from "@/lib/http";
import { testLoginEnabled } from "@/lib/testLogin";

/**
 * What the server offers (no secrets): place search, BoardGameGeek lookups, test sign-in (end-to-end
 * tests and staging only), and the oldest phone app allowed (older ones are asked to update).
 */
export const GET = () =>
  json({ googlePlaces: googleAvailable(), bgg: bggAvailable(), testLogin: testLoginEnabled(), minAppVersion: minAppVersion(), appStores: APP_STORES });
