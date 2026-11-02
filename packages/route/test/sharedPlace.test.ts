import { describe, expect, it } from "vitest";
import { parseSharedPlace } from "../src";

describe("parseSharedPlace", () => {
  it("Google Maps share: name, address and link", () => {
    expect(parseSharedPlace("Blue Bottle Coffee\n315 Linden St, San Francisco, CA 94102\nhttps://maps.app.goo.gl/abc123")).toEqual({
      name: "Blue Bottle Coffee",
      address: "315 Linden St, San Francisco, CA 94102",
      mapsUrl: "https://maps.app.goo.gl/abc123",
      yelpUrl: "",
      source: "gmaps",
    });
  });
  it("Yelp share sentence: strips the 'Check out … on Yelp' wrapper", () => {
    expect(parseSharedPlace("Check out Tsujita LA Artisan Noodle on Yelp! https://yelp.to/AbC12")).toMatchObject({
      name: "Tsujita LA Artisan Noodle",
      mapsUrl: "",
      yelpUrl: "https://yelp.to/AbC12",
      source: "yelp",
    });
  });
  it("Yelp link with a title (Android EXTRA_SUBJECT / iOS page title)", () => {
    expect(parseSharedPlace("https://www.yelp.com/biz/tsujita-la-artisan-noodle-los-angeles", "Tsujita LA Artisan Noodle")).toMatchObject({
      name: "Tsujita LA Artisan Noodle",
      yelpUrl: "https://www.yelp.com/biz/tsujita-la-artisan-noodle-los-angeles",
      source: "yelp",
    });
  });
  it("plain text is just a name", () => {
    expect(parseSharedPlace("공원")).toMatchObject({ name: "공원", source: "other", mapsUrl: "", yelpUrl: "" });
  });
});
