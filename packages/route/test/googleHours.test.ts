import { describe, expect, it } from "vitest";
import { googlePeriodsToHoursRaw, parseHours } from "../src";

describe("googlePeriodsToHoursRaw", () => {
  it("weekday lunch + dinner, closed Sunday", () => {
    const periods = [1, 2, 3, 4, 5].flatMap((d) => [
      { open: { day: d, hour: 11, minute: 0 }, close: { day: d, hour: 14, minute: 0 } },
      { open: { day: d, hour: 17, minute: 0 }, close: { day: d, hour: 22, minute: 0 } },
    ]);
    const raw = googlePeriodsToHoursRaw(periods);
    expect(raw).toBe(
      "Mon 11:00-14:00 17:00-22:00; Tue 11:00-14:00 17:00-22:00; Wed 11:00-14:00 17:00-22:00; Thu 11:00-14:00 17:00-22:00; Fri 11:00-14:00 17:00-22:00",
    );
    expect(parseHours(raw)![6]).toBeUndefined();
  });
  it("past midnight and closing at midnight", () => {
    expect(googlePeriodsToHoursRaw([{ open: { day: 5, hour: 18 }, close: { day: 6, hour: 2 } }])).toBe("Fri 18:00-02:00");
    expect(googlePeriodsToHoursRaw([{ open: { day: 1, hour: 17 }, close: { day: 2, hour: 0, minute: 0 } }])).toBe("Mon 17:00-24:00");
  });
  it("open 24/7 (no close)", () => {
    expect(googlePeriodsToHoursRaw([{ open: { day: 0, hour: 0, minute: 0 } }])).toBe("24h");
  });
  it("nothing", () => {
    expect(googlePeriodsToHoursRaw(undefined)).toBe("");
  });
});
