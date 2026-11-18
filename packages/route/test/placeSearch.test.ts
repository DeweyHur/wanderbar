import { describe, expect, it } from "vitest";
import { formatPlaceDistance, matchVisited, metersBetween, nearestKnown, sortFound, usZip } from "../src/placeSearch";

const culver = { lat: 34.0211, lng: -118.3965 };
const santaMonica = { lat: 34.0195, lng: -118.4912 };

describe("place search", () => {
  it("measures and shows distances (miles in the US)", () => {
    expect(metersBetween(culver, santaMonica)).toBeGreaterThan(8600);
    expect(metersBetween(culver, santaMonica)).toBeLessThan(8800);
    expect(formatPlaceDistance(100, true)).toBe("330 ft");
    expect(formatPlaceDistance(700, true)).toBe("0.4 mi");
    expect(formatPlaceDistance(30000, true)).toBe("19 mi");
    expect(formatPlaceDistance(640, false)).toBe("640 m");
    expect(formatPlaceDistance(1500, false)).toBe("1.5 km");
  });

  it("reads US ZIP codes", () => {
    expect(usZip(" 90230 ")).toBe("90230");
    expect(usZip("90230-1234")).toBe("90230");
    expect(usZip("9023")).toBeNull();
    expect(usZip("abcde")).toBeNull();
  });

  it("places you've been: matching ones, nearest first", () => {
    const v = [
      { key: "a", name: "Tacos Far", address: "Santa Monica", googlePlaceId: "p1", ...santaMonica },
      { key: "b", name: "Tacos Near", address: "Culver City", googlePlaceId: "p2", ...culver },
      { key: "c", name: "Ramen", address: "Culver City", googlePlaceId: "p3", ...culver },
    ];
    expect(matchVisited(v, "taco", culver).map((x) => [x.name, x.meters])).toEqual([
      ["Tacos Near", 0],
      ["Tacos Far", metersBetween(culver, santaMonica)],
    ]);
    expect(matchVisited(v, "culver", null).map((x) => x.name)).toEqual(["Tacos Near", "Ramen"]);
    expect(matchVisited(v, "  ", culver)).toEqual([]);
  });

  it("Google's suggestions: nearest first, unknown distances after, visited ones not twice", () => {
    const found = [
      { placeId: "x", distanceMeters: 5000 },
      { placeId: "y" },
      { placeId: "p2", distanceMeters: 10 },
      { placeId: "z", distanceMeters: 300 },
      { placeId: "w", distanceMeters: null },
    ];
    expect(sortFound(found, new Set(["p2"])).map((f) => f.placeId)).toEqual(["z", "x", "y", "w"]);
  });
});

describe("nearestKnown", () => {
  const hotel = { lat: 35.0116, lng: 135.7681 }; // Kyoto
  const at = (key: string, lat: number, lng: number, googlePlaceId = "") => ({ key, name: key, address: "", lat, lng, googlePlaceId });
  const known = [at("far-home", 34.05, -118.24), at("temple", 35.0270, 135.7982), at("cafe", 35.0120, 135.7690, "g-cafe"), at("osaka", 34.6937, 135.5023)];
  it("lists places around the origin nearest first, leaving out far ones and ones already on the route", () => {
    expect(nearestKnown(known, hotel, new Set()).map((v) => v.key)).toEqual(["cafe", "temple", "osaka"]);
    expect(nearestKnown(known, hotel, new Set(["g-cafe"])).map((v) => v.key)).toEqual(["temple", "osaka"]);
    expect(nearestKnown(known, hotel, new Set(), 1).map((v) => v.key)).toEqual(["cafe"]);
  });
});
