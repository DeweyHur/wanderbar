import { clock, dayOfDate, hoursOnDay, hoursStatusFromText, type HoursStatus, type WallTime } from "@wanderbar/route";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { useColors, Text } from "@/components/ui";

export function hoursLabel(t: TFunction, s: HoursStatus): string | null {
  switch (s.kind) {
    case "open":
      return s.closesAt === null ? t("food:hours.open24") : t("food:hours.open", { time: clock(s.closesAt) });
    case "closingSoon":
      return t("food:hours.closingSoon", { minutes: s.minutesLeft });
    case "closed":
      return s.opensAt === null ? t("food:hours.closed") : t("food:hours.closedOpensAt", { time: clock(s.opensAt) });
    case "unknown":
      return null;
  }
}

/**
 * "Open · until 22:00" / "Closing soon" / "Closed", colored. Nothing when hours are unknown.
 * With `day` (a planned day other than today): that day's hours, "That day 11:30–22:00" / "Closed that day".
 */
export function HoursBadge({ hoursRaw, now, day }: { hoursRaw: string; now: WallTime; day?: string | null }) {
  const { t } = useTranslation();
  const c = useColors();
  if (day) {
    const ranges = hoursOnDay(hoursRaw, dayOfDate(day));
    if (!ranges) return null;
    const allDay = ranges.length === 1 && ranges[0].start === 0 && ranges[0].end >= 24 * 60;
    const label = !ranges.length
      ? t("food:hours.closedOnDay")
      : allDay
        ? t("food:hours.open24")
        : t("food:hours.onDay", { hours: ranges.map((r) => `${clock(r.start)}–${clock(r.end)}`).join(", ") });
    return <Text style={{ color: ranges.length ? c.ok : c.danger, fontSize: 14, fontWeight: "600" }}>{label}</Text>;
  }
  const s = hoursStatusFromText(hoursRaw, now);
  const label = hoursLabel(t, s);
  if (!label) return null;
  const color = s.kind === "open" ? c.ok : s.kind === "closingSoon" ? c.warn : c.danger;
  return <Text style={{ color, fontSize: 14, fontWeight: "600" }}>{label}</Text>;
}
