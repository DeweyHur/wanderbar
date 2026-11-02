// Ported from legacy-android HoursTest.kt. Days: 0 = Monday … 6 = Sunday.
import { describe, expect, it } from "vitest";
import { formatHours, hoursStatus, hoursStatusFromText, parseHours, wallTime, type Day } from "../src";

const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6;
const at = (day: Day, h: number, m = 0) => ({ day, minutes: h * 60 + m });
const t = (h: number, m = 0) => h * 60 + m;

describe("Hours", () => {
  it("empty or unparseable is unknown", () => {
    expect(parseHours("")).toBeNull();
    expect(parseHours("call ahead")).toBeNull();
    expect(hoursStatusFromText(null, at(MON, 10))).toEqual({ kind: "unknown" });
  });

  it("every day, simple", () => {
    const h = parseHours("09:00-22:00")!;
    expect(Object.keys(h)).toHaveLength(7);
    expect(hoursStatus(h, at(SUN, 12))).toEqual({ kind: "open", closesAt: t(22) });
    expect(hoursStatus(h, at(SUN, 21, 30))).toEqual({ kind: "closingSoon", closesAt: t(22), minutesLeft: 30 });
    expect(hoursStatus(h, at(SUN, 7))).toEqual({ kind: "closed", opensAt: t(9) });
    expect(hoursStatus(h, at(SUN, 22))).toEqual({ kind: "closed", opensAt: null });
  });

  it("English days and closed", () => {
    const h = parseHours("Mon-Fri 9:00-18:00; Sat 10-14; Sun closed")!;
    expect(h[WED]).toEqual([{ start: 540, end: 1080 }]);
    expect(h[SAT]).toEqual([{ start: 600, end: 840 }]);
    expect(h[SUN]).toEqual([]);
    expect(hoursStatus(h, at(SUN, 12)).kind).toBe("closed");
  });

  it("Korean split shift", () => {
    const h = parseHours("월-금 11:00-14:00 17:00-22:00, 토 12:00-23:00, 일 휴무")!;
    expect(h[TUE]).toEqual([{ start: 660, end: 840 }, { start: 1020, end: 1320 }]);
    expect(hoursStatus(h, at(TUE, 15))).toEqual({ kind: "closed", opensAt: t(17) });
    expect(h[SUN]).toEqual([]);
  });

  it("comma-separated days", () => {
    expect(Object.keys(parseHours("토, 일 10:00-20:00")!).sort()).toEqual(["5", "6"]);
  });

  it("overnight with am/pm", () => {
    const h = parseHours("Fri-Sat 6pm-2am")!;
    expect(h[FRI]).toEqual([{ start: 1080, end: 120 }]);
    expect(hoursStatus(h, at(FRI, 23))).toEqual({ kind: "open", closesAt: t(2) });
    // Saturday 01:30 is still Friday night.
    expect(hoursStatus(h, at(SAT, 1, 30))).toEqual({ kind: "closingSoon", closesAt: t(2), minutesLeft: 30 });
    expect(hoursStatus(h, at(THU, 23)).kind).toBe("closed");
  });

  it("midnight end", () => {
    expect(hoursStatusFromText("17:00-24:00", at(MON, 20))).toEqual({ kind: "open", closesAt: 0 });
    expect(parseHours("17:00-00:00")![MON]).toEqual([{ start: 1020, end: 1440 }]);
  });

  it("all day", () => {
    expect(hoursStatusFromText("24h", at(MON, 23, 50))).toEqual({ kind: "open", closesAt: null });
    expect(hoursStatusFromText("매일 24시간", at(MON, 3))).toEqual({ kind: "open", closesAt: null });
  });

  it("weekday / weekend words", () => {
    const h = parseHours("평일 08:00-17:00 주말 10:00-15:00")!;
    expect(h[FRI]).toEqual([{ start: 480, end: 1020 }]);
    expect(h[SUN]).toEqual([{ start: 600, end: 900 }]);
  });

  it("Google-style narrow spaces", () => {
    expect(parseHours("Monday: 9:00 AM – 5:00 PM")![MON]).toEqual([{ start: 540, end: 1020 }]);
  });

  it("format round-trips", () => {
    const h = parseHours("Mon-Fri 11:00-14:00 17:00-22:00; Fri-Sat 6pm-2am; Sun closed")!;
    const nonEmpty = Object.fromEntries(Object.entries(h).filter(([, v]) => v!.length));
    expect(parseHours(formatHours(h))).toEqual(nonEmpty);
    expect(formatHours(parseHours("24h")!)).toBe("24h");
    expect(formatHours({ [MON]: [{ start: 1020, end: 1440 }] })).toBe("Mon 17:00-24:00");
  });

  it("wallTime maps JS Sunday-first days to Monday-first", () => {
    expect(wallTime(new Date(2026, 10, 2, 9, 30))).toEqual({ day: MON, minutes: 570 }); // 2026-11-02 is a Monday
    expect(wallTime(new Date(2026, 10, 8, 0, 5))).toEqual({ day: SUN, minutes: 5 });
  });
});
