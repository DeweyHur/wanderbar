import { describe, expect, it } from "vitest";
import { formatPlaceDistance, matchVisited, metersBetween, sortFound, usZip } from "../src/placeSearch";

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
