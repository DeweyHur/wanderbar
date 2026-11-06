import { describe, expect, it } from "vitest";
import { reminderSchedule, type ReminderDay } from "../src/reminders";

const day = (p: Partial<ReminderDay>): ReminderDay => ({ planId: "p", groupId: "g", date: "2026-11-10", title: "", atHome: false, stops: 0, firstStop: null, meals: 0, toBuy: 0, ...p });
const local = (s: string) => new Date(s); // no Z: the phone's local time

describe("reminderSchedule", () => {
  it("a route: evening before and that morning; a day at home with shopping left: afternoon before and morning", () => {
    const r = reminderSchedule(
      [day({ planId: "trip", date: "2026-11-10", stops: 3, firstStop: "Tartine" }), day({ planId: "home", date: "2026-11-11", atHome: true, meals: 2, toBuy: 4 })],
      local("2026-11-08T12:00:00"),
    );
    expect(r.map((x) => [x.kind, x.planId, x.at.getTime()])).toEqual([
      ["routeTomorrow", "trip", local("2026-11-09T20:00:00").getTime()],
      ["routeToday", "trip", local("2026-11-10T08:30:00").getTime()],
      ["shopTomorrow", "home", local("2026-11-10T17:00:00").getTime()],
      ["shopToday", "home", local("2026-11-11T09:00:00").getTime()],
    ]);
    expect(r[0]).toMatchObject({ id: "routeTomorrow-trip", firstStop: "Tartine", stops: 3 });
  });

  it("skips past times, empty routes, and days at home with nothing to buy; crosses month ends", () => {
    const r = reminderSchedule(
      [day({ planId: "a", date: "2026-12-01", stops: 1 }), day({ planId: "b", date: "2026-12-02" }), day({ planId: "c", date: "2026-12-02", atHome: true, meals: 1 })],
      local("2026-11-30T21:00:00"),
    );
    expect(r.map((x) => [x.kind, x.at.getDate()])).toEqual([["routeToday", 1]]);
  });
});
