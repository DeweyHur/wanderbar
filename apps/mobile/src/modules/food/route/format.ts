import { durationParts } from "@wanderbar/route";
import type { TFunction } from "i18next";

export function formatDuration(t: TFunction, seconds: number) {
  const { hours: h, minutes: m } = durationParts(seconds);
  if (h === 0) return t("food:duration.minutes", { m });
  if (m === 0) return t("food:duration.hours", { h });
  return t("food:duration.hoursMinutes", { h, m });
}
