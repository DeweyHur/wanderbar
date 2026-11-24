import { describe, expect, it } from "vitest";
import { fixedReminders, leaveAt, type FixedStop } from "../src/reminders";

const dinner: FixedStop = { stopId: "s1", planId: "p1", groupId: "g1", name: "Mariposa", fixedAt: "2026-11-24T19:30:00-07:00", from: "Bell Rock", travelSeconds: 25 * 60 };
const t = (iso: string) => new Date(iso);

describe("fixed-time stops", () => {
  it("leave by: the time minus the drive and 10 minutes of slack", () => {
    expect(leaveAt(t(dinner.fixedAt), dinner.travelSeconds)).toEqual(t("2026-11-24T18:55:00-07:00"));
    expect(leaveAt(t(dinner.fixedAt), null)).toBeNull();
  });

  it("reminds 15 minutes before leaving and when it's time to go", () => {
    const r = fixedReminders([dinner], t("2026-11-24T12:00:00-07:00"));
    expect(r.map((x) => [x.kind, x.at.toISOString()])).toEqual([
      ["leaveSoon", t("2026-11-24T18:40:00-07:00").toISOString()],
      ["leaveNow", t("2026-11-24T18:55:00-07:00").toISOString()],
    ]);
    expect(r[0]).toMatchObject({ id: "leaveSoon-s1", name: "Mariposa", from: "Bell Rock" });
  });

  it("without a known drive: an hour before; times already gone are skipped", () => {
    const show: FixedStop = { ...dinner, stopId: "s2", travelSeconds: null, fixedAt: "2026-11-24T20:00:00-07:00" };
    expect(fixedReminders([show], t("2026-11-24T12:00:00-07:00")).map((x) => [x.kind, x.at.toISOString()])).toEqual([["fixedSoon", t("2026-11-24T19:00:00-07:00").toISOString()]]);
    expect(fixedReminders([dinner], t("2026-11-24T18:45:00-07:00")).map((x) => x.kind)).toEqual(["leaveNow"]);
  });
});
