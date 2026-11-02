import { clock, hoursStatusFromText, type HoursStatus, type WallTime } from "@wanderbar/route";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";
import { useColors } from "@/components/ui";

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

/** "Open · until 22:00" / "Closing soon" / "Closed", colored. Nothing when hours are unknown. */
export function HoursBadge({ hoursRaw, now }: { hoursRaw: string; now: WallTime }) {
  const { t } = useTranslation();
  const c = useColors();
  const s = hoursStatusFromText(hoursRaw, now);
  const label = hoursLabel(t, s);
  if (!label) return null;
  const color = s.kind === "open" ? c.ok : s.kind === "closingSoon" ? c.warn : c.danger;
  return <Text style={{ color, fontSize: 14, fontWeight: "600" }}>{label}</Text>;
}
