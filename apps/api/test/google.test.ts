import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { autocomplete, computeRoute, googleFakeEnabled, placeDetails, type Fetch } from "@/lib/google";

const calls: { url: string; init: RequestInit }[] = [];
const fakeFetch = (body: unknown, status = 200): Fetch =>
  (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as Fetch;
const header = (i: number, name: string) => (calls[i].init.headers as Record<string, string>)[name];

beforeEach(() => {
  calls.length = 0;
  process.env.GOOGLE_SERVER_KEY = "server-key";
});
afterEach(() => {
  delete process.env.GOOGLE_SERVER_KEY;
});

describe("server-side Google", () => {
  it("autocomplete sends the server key, session and location bias, and maps suggestions", async () => {
    const f = fakeFetch({
      suggestions: [{ placePrediction: { placeId: "p1", structuredFormat: { mainText: { text: "Blue Bottle" }, secondaryText: { text: "SF" } } } }, {}],
    });
    expect(await autocomplete("blue", "session-123", { lat: 37.7, lng: -122.4 }, f)).toEqual([{ placeId: "p1", primary: "Blue Bottle", secondary: "SF" }]);
    expect(header(0, "X-Goog-Api-Key")).toBe("server-key");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ input: "blue", sessionToken: "session-123", locationBias: { circle: { center: { latitude: 37.7, longitude: -122.4 } } } });
  });

  it("details asks only for the fields we use and converts opening hours", async () => {
    const f = fakeFetch({
      displayName: { text: "SFJAZZ" },
      formattedAddress: "201 Franklin St",
      location: { latitude: 37.77, longitude: -122.42 },
      googleMapsUri: "https://maps.google.com/?cid=9",
      regularOpeningHours: { periods: [{ open: { day: 5, hour: 18 }, close: { day: 6, hour: 2 } }] },
    });
    expect(await placeDetails("p9", "session-123", f)).toEqual({
      googlePlaceId: "p9",
      name: "SFJAZZ",
      address: "201 Franklin St",
      lat: 37.77,
      lng: -122.42,
      mapsUrl: "https://maps.google.com/?cid=9",
      hoursRaw: "Fri 18:00-02:00",
    });
    expect(calls[0].url).toContain("/places/p9?sessionToken=session-123");
    expect(header(0, "X-Goog-FieldMask")).toBe("id,displayName,formattedAddress,location,googleMapsUri,regularOpeningHours");
  });

  it("routes sum the legs", async () => {
    const f = fakeFetch({ routes: [{ legs: [{ duration: "600s", distanceMeters: 3000, polyline: { encodedPolyline: "abc" } }, { duration: "120s", distanceMeters: 500 }] }] });
    const r = await computeRoute([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }], f);
    expect(r).toEqual({ seconds: 720, meters: 3500, legs: [{ seconds: 600, meters: 3000, polyline: "abc" }, { seconds: 120, meters: 500, polyline: "" }] });
    expect(JSON.parse(calls[0].init.body as string).intermediates).toHaveLength(1);
  });

  it("no key: 503 google.unavailable; Google errors: 502", async () => {
    delete process.env.GOOGLE_SERVER_KEY;
    await expect(autocomplete("x", "session-123", null, fakeFetch({}))).rejects.toMatchObject({ status: 503, code: "google.unavailable" });
    process.env.GOOGLE_SERVER_KEY = "k";
    await expect(autocomplete("x", "session-123", null, fakeFetch({ error: { message: "denied" } }, 403))).rejects.toMatchObject({ status: 502, code: "google.failed" });
  });

  it("the fake mode is only for tests on the in-memory database, never on Vercel", () => {
    expect(googleFakeEnabled({})).toBe(false);
    expect(googleFakeEnabled({ E2E_FAKE_GOOGLE: "1", DATABASE_URL: "postgres://neon" })).toBe(false);
    expect(googleFakeEnabled({ E2E_FAKE_GOOGLE: "1", DATABASE_URL: "pglite:memory", VERCEL: "1" })).toBe(false);
    expect(googleFakeEnabled({ E2E_FAKE_GOOGLE: "1", DATABASE_URL: "pglite:memory" })).toBe(true);
  });
});
