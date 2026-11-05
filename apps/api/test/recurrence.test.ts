import { describe, expect, it } from "vitest";
import { localDate, localTime, meetsOn, nextOccurrence, weekdayOf, zonedInstant } from "@/lib/recurrence";

const LA = "America/Los_Angeles";
const SEOUL = "Asia/Seoul";

describe("recurrence", () => {
  it("turns a local wall time into the right instant, across DST", () => {
    expect(zonedInstant("2026-07-04", "19:00", LA).toISOString()).toBe("2026-07-05T02:00:00.000Z"); // PDT, UTC-7
    expect(zonedInstant("2026-12-05", "19:00", LA).toISOString()).toBe("2026-12-06T03:00:00.000Z"); // PST, UTC-8
    expect(zonedInstant("2026-12-05", "19:00", SEOUL).toISOString()).toBe("2026-12-05T10:00:00.000Z");
    expect(localDate(new Date("2026-12-06T03:00:00Z"), LA)).toBe("2026-12-05");
    expect(localTime(new Date("2026-12-06T03:00:00Z"), LA)).toBe("19:00");
    expect(weekdayOf("2026-11-07")).toBe(6); // Saturday
  });

  it("weekly: the next Saturday 7 pm, and still 7 pm local after the clocks change", () => {
    const r = { weekday: 6, time: "19:00", everyWeeks: 1, startDate: "2026-10-01" };
    // Thursday Oct 29 → Saturday Oct 31 (PDT)
    expect(nextOccurrence(r, new Date("2026-10-29T20:00:00Z"), LA).toISOString()).toBe("2026-11-01T02:00:00.000Z");
    // Sunday Nov 1 (DST ended) → Saturday Nov 7 (PST)
    const next = nextOccurrence(r, new Date("2026-11-01T18:00:00Z"), LA);
    expect(next.toISOString()).toBe("2026-11-08T03:00:00.000Z");
    expect(localTime(next, LA)).toBe("19:00");
    // Saturday 6:59 pm local → that same evening; 7:01 pm → next week
    expect(nextOccurrence(r, new Date("2026-11-08T02:59:00Z"), LA).toISOString()).toBe("2026-11-08T03:00:00.000Z");
    expect(nextOccurrence(r, new Date("2026-11-08T03:01:00Z"), LA).toISOString()).toBe("2026-11-15T03:00:00.000Z");
  });

  it("every 2 weeks counts from the first meeting on or after the start date", () => {
    const r = { weekday: 5, time: "20:30", everyWeeks: 2, startDate: "2026-11-04" }; // first Friday: Nov 6
    expect(meetsOn(r, "2026-11-06")).toBe(true);
    expect(meetsOn(r, "2026-11-13")).toBe(false);
    expect(meetsOn(r, "2026-11-20")).toBe(true);
    expect(meetsOn(r, "2026-10-23")).toBe(false); // before the start
    expect(localDate(nextOccurrence(r, new Date("2026-11-07T12:00:00Z"), SEOUL), SEOUL)).toBe("2026-11-20");
  });

  it("never returns a day before the start date", () => {
    const r = { weekday: 0, time: "15:00", everyWeeks: 1, startDate: "2027-01-01" };
    expect(localDate(nextOccurrence(r, new Date("2026-11-05T00:00:00Z"), LA), LA)).toBe("2027-01-03");
  });
});
