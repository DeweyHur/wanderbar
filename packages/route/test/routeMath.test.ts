// Ported from legacy-android RouteMathTest.kt.
import { describe, expect, it } from "vitest";
import { decodePolyline, durationParts, formatDistance, parseDurationSeconds } from "../src";

describe("RouteMath", () => {
  it("decodes Google's documentation example", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });
  it("durations", () => {
    expect(parseDurationSeconds("1234s")).toBe(1234);
    expect(parseDurationSeconds(null)).toBe(0);
    expect(durationParts(20)).toEqual({ hours: 0, minutes: 1 });
    expect(durationParts(3900)).toEqual({ hours: 1, minutes: 5 });
    expect(durationParts(7200)).toEqual({ hours: 2, minutes: 0 });
  });
  it("distances", () => {
    expect(formatDistance(850)).toBe("850m");
    expect(formatDistance(12345)).toBe("12.3km");
  });
});
