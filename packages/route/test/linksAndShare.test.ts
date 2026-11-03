// Ported from legacy-android LinksAndShareTest.kt.
import { describe, expect, it } from "vitest";
import { Links, parseSharedText, teslaShareText, teslaShareTextWithFallback } from "../src";

describe("exact place links", () => {
  it("opens the place itself when the Google place id is known", () => {
    expect(Links.googlePlace("Mensho Tokyo", "672 Geary St", "ChIJabc")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Mensho+Tokyo%2C+672+Geary+St&query_place_id=ChIJabc",
    );
    expect(Links.googlePlace("X", "", "", "https://maps.google.com/?cid=4")).toBe("https://maps.google.com/?cid=4");
    expect(Links.googlePlace("X", "SF")).toBe("https://www.google.com/maps/search/?api=1&query=X%2C+SF");
    expect(Links.googleDirections("X", "SF", "ChIJabc")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=X%2C+SF&travelmode=driving&destination_place_id=ChIJabc",
    );
  });
});

describe("Links", () => {
  it("directions encode the query", () => {
    expect(Links.googleDirections("Blue Bottle", "315 Linden St")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Blue+Bottle%2C+315+Linden+St&travelmode=driving",
    );
  });
  it("Yelp omits an empty location", () => {
    expect(Links.yelpSearch("재즈바", " ")).toBe("https://www.yelp.com/search?find_desc=%EC%9E%AC%EC%A6%88%EB%B0%94");
    expect(Links.yelpSearch("SFJAZZ", "San Francisco")).toBe("https://www.yelp.com/search?find_desc=SFJAZZ&find_loc=San+Francisco");
  });
  it("Tesla formats", () => {
    const p = { name: "Blue Bottle", address: "315 Linden St", mapsUrl: "https://maps.app.goo.gl/abc" };
    expect(teslaShareText("address", p)).toBe("315 Linden St");
    expect(teslaShareText("address", { name: "Park", address: "" })).toBe("Park");
    expect(teslaShareText("nameAddress", p)).toBe("Blue Bottle, 315 Linden St");
    expect(teslaShareText("coords", p)).toBeNull();
    expect(teslaShareText("coords", { ...p, lat: 37.7749, lng: -122.4194 })).toBe("37.774900,-122.419400");
    expect(teslaShareText("link", p)).toBe(p.mapsUrl);
    expect(teslaShareText("full", p)).toBe(`Blue Bottle\n315 Linden St\n${p.mapsUrl}`);
    expect(teslaShareText("full", { name: "Park" })).toBe("Park\nhttps://www.google.com/maps/search/?api=1&query=Park");
    expect(teslaShareTextWithFallback("coords", p)).toBe("315 Linden St");
  });
});

describe("parseSharedText", () => {
  it("parses a Google Maps share", () => {
    expect(parseSharedText("Blue Bottle Coffee\n315 Linden St, San Francisco, CA 94102\nhttps://maps.app.goo.gl/abc123")).toEqual({
      name: "Blue Bottle Coffee",
      address: "315 Linden St, San Francisco, CA 94102",
      mapsUrl: "https://maps.app.goo.gl/abc123",
    });
  });
  it("parses URL-only shares and subjects", () => {
    expect(parseSharedText("https://maps.app.goo.gl/xyz", "Golden Gate Park")).toEqual({
      name: "Golden Gate Park",
      address: "",
      mapsUrl: "https://maps.app.goo.gl/xyz",
    });
    const q = parseSharedText("그냥 메모");
    expect(q.mapsUrl).toBeNull();
    expect(q.name).toBe("그냥 메모");
  });
});
