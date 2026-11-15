import { describe, expect, it } from "vitest";
import { addressKey, firstUrl, listingSource, parseListingUrl, pricePerSqft, scoreAverage } from "../src";

describe("parseListingUrl", () => {
  it("Zillow homedetails link", () => {
    expect(parseListingUrl("https://www.zillow.com/homedetails/1234-W-Main-St-Torrance-CA-90501/12345678_zpid/?utm_source=share")).toEqual({
      source: "zillow",
      url: "https://www.zillow.com/homedetails/1234-W-Main-St-Torrance-CA-90501/12345678_zpid/",
      street: "1234 W Main St",
      city: "Torrance",
      state: "CA",
      zip: "90501",
      address: "1234 W Main St, Torrance, CA 90501",
    });
  });
  it("Zillow: two-word city and a unit", () => {
    expect(parseListingUrl("https://www.zillow.com/homedetails/4100-Duquesne-Ave-APT-12-Culver-City-CA-90232/20450000_zpid/")).toMatchObject({
      street: "4100 Duquesne Ave APT 12",
      city: "Culver City",
      address: "4100 Duquesne Ave APT 12, Culver City, CA 90232",
    });
  });
  it("Zillow share sentence from the app", () => {
    expect(parseListingUrl("Check out this home I found on Zillow. https://www.zillow.com/homedetails/15520-Larch-Ave-Lawndale-CA-90260/2088_zpid/")).toMatchObject({
      address: "15520 Larch Ave, Lawndale, CA 90260",
    });
  });
  it("Redfin link (with and without a unit)", () => {
    expect(parseListingUrl("https://www.redfin.com/CA/Hawthorne/13915-Cerise-Ave-90250/home/7000000")).toMatchObject({
      source: "redfin",
      address: "13915 Cerise Ave, Hawthorne, CA 90250",
    });
    expect(parseListingUrl("https://www.redfin.com/CA/Culver-City/5800-Hannum-Ave-90230/unit-110/home/1")).toMatchObject({
      street: "5800 Hannum Ave Unit 110",
      city: "Culver City",
    });
  });
  it("Realtor.com link", () => {
    expect(parseListingUrl("https://www.realtor.com/realestateandhomes-detail/21900-Main-St_Carson_CA_90745_M12345-67890")).toMatchObject({
      source: "realtor",
      address: "21900 Main St, Carson, CA 90745",
    });
  });
  it("not a listing link", () => {
    expect(parseListingUrl("https://www.zillow.com/torrance-ca/")).toBeNull();
    expect(parseListingUrl("https://maps.app.goo.gl/abc")).toBeNull();
    expect(parseListingUrl("1234 Main St")).toBeNull();
  });
});

describe("helpers", () => {
  it("firstUrl trims trailing punctuation", () => {
    expect(firstUrl("see https://redfin.com/x/y.")).toBe("https://redfin.com/x/y");
    expect(firstUrl("no link")).toBeNull();
  });
  it("listingSource", () => {
    expect(listingSource("https://m.zillow.com/homedetails/x")).toBe("zillow");
    expect(listingSource("https://example.com")).toBeNull();
  });
  it("addressKey treats spelled-out and abbreviated addresses as one house", () => {
    expect(addressKey("1234 West Main Street, Torrance, CA 90501, USA")).toBe(addressKey("1234 W. Main St, Torrance, CA 90501"));
    expect(addressKey("5800 Hannum Ave #110, Culver City")).toBe(addressKey("5800 Hannum Ave Unit 110, Culver City"));
  });
  it("price per sqft and score average", () => {
    expect(pricePerSqft(900_000, 1200)).toBe(750);
    expect(pricePerSqft(null, 1200)).toBeNull();
    expect(scoreAverage({ light: 4, layout: 5, noise: null })).toBe(4.5);
    expect(scoreAverage({})).toBeNull();
  });
});
