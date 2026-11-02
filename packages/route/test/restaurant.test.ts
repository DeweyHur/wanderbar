import { describe, expect, it } from "vitest";
import { categoryFromGoogleType, coordsFromMapsUrl, formatPrice, isFoodCategory, isShortLink, parsePrice, priceInput, yelpAlias } from "../src/restaurant";

describe("restaurant keys", () => {
  it("takes the Yelp alias from biz links, any Yelp domain, ignoring query and case", () => {
    expect(yelpAlias("https://www.yelp.com/biz/tsujita-la-artisan-noodle-los-angeles?utm_source=ishare")).toBe("tsujita-la-artisan-noodle-los-angeles");
    expect(yelpAlias("https://m.yelp.com/biz/Mensho-Tokyo-San-Francisco")).toBe("mensho-tokyo-san-francisco");
    expect(yelpAlias("https://www.yelp.ca/biz/%EC%B9%B4%ED%8E%98-toronto")).toBe("카페-toronto");
    expect(yelpAlias("https://yelp.to/AbC12")).toBeNull();
    expect(yelpAlias("https://www.yelp.com/search?find_desc=ramen")).toBeNull();
  });

  it("knows which links are short links to follow", () => {
    expect(isShortLink("https://yelp.to/AbC12")).toBe(true);
    expect(isShortLink("https://maps.app.goo.gl/xyz")).toBe(true);
    expect(isShortLink("https://goo.gl/maps/xyz")).toBe(true);
    expect(isShortLink("https://www.yelp.com/biz/a")).toBe(false);
    expect(isShortLink("https://evil.example/yelp.to/")).toBe(false);
  });
});

describe("categories", () => {
  it("guesses a category from Google's primary type", () => {
    expect(categoryFromGoogleType("korean_restaurant")).toBe("korean");
    expect(categoryFromGoogleType("ramen_restaurant")).toBe("japanese");
    expect(categoryFromGoogleType("coffee_shop")).toBe("cafe");
    expect(categoryFromGoogleType("hamburger_restaurant")).toBe("burger");
    expect(categoryFromGoogleType("bar")).toBe("bar");
    expect(categoryFromGoogleType("barbecue_restaurant")).toBe("bbq");
    expect(categoryFromGoogleType("restaurant")).toBeNull();
    expect(categoryFromGoogleType(null)).toBeNull();
  });
  it("accepts only known ids", () => {
    expect(isFoodCategory("korean")).toBe(true);
    expect(isFoodCategory("한식")).toBe(false);
  });
});

describe("prices", () => {
  it("parses what people type into minor units of the currency", () => {
    expect(parsePrice("12.5", "USD")).toBe(1250);
    expect(parsePrice("$14", "USD")).toBe(1400);
    expect(parsePrice("12,000", "KRW")).toBe(12000);
    expect(parsePrice("₩9,000원", "KRW")).toBe(9000);
    expect(parsePrice("", "USD")).toBeNull();
    expect(parsePrice("free", "USD")).toBeNull();
  });
  it("formats and round-trips for editing", () => {
    expect(formatPrice(1250, "USD", "en-US")).toBe("$12.50");
    expect(formatPrice(1400, "USD", "en-US")).toBe("$14");
    expect(formatPrice(9000, "KRW", "ko-KR")).toBe("₩9,000");
    expect(priceInput(1250, "USD")).toBe("12.50");
    expect(priceInput(9000, "KRW")).toBe("9000");
  });
});

describe("maps coordinates", () => {
  it("reads @lat,lng and q=lat,lng", () => {
    expect(coordsFromMapsUrl("https://www.google.com/maps/place/Mensho+Tokyo/@37.7866,-122.4146,17z")).toEqual({ lat: 37.7866, lng: -122.4146 });
    expect(coordsFromMapsUrl("https://maps.google.com/?q=37.5665,126.978")).toEqual({ lat: 37.5665, lng: 126.978 });
    expect(coordsFromMapsUrl("https://maps.app.goo.gl/abc")).toBeNull();
  });
});
