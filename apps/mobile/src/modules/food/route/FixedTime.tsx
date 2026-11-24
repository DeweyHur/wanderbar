import { leaveAt } from "@wanderbar/route";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Body, Button, Chip, ErrorText, Field, Text, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { routeApi, type Stop } from "./api";

/** "19:30", "7:30", "1930", "7:30pm", "오후 7:30" → minutes after midnight; null if it isn't a time. */
export function parseClock(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^(오전|오후)?(\d{1,2})(?::|\.|시)?(\d{2})?(?:분)?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[2]);
  const min = m[3] ? Number(m[3]) : 0;
  const pm = m[1] === "오후" || m[4]?.startsWith("p");
  const am = m[1] === "오전" || m[4]?.startsWith("a");
  if ((pm || am) && (h < 1 || h > 12)) return null;
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** That day at that clock time, in the phone's time zone. */
const onDay = (day: string, minutes: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
};
const clockOf = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export const formatClock = (lang: string, d: Date) => new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit" }).format(d);

/**
 * The line under a stop with a fixed time: "🕐 7:30 PM · leave by 6:55 PM". On the live day, once that's
 * passed: "leave now". A past day just shows the time.
 */
export function FixedLine({ stop, legSeconds, now, mode }: { stop: Pick<Stop, "fixedAt" | "status">; legSeconds: number | null | undefined; now: Date; mode: "live" | "plan" | "record" }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  if (!stop.fixedAt) return null;
  const at = new Date(stop.fixedAt);
  const leave = mode === "record" || stop.status === "done" || stop.status === "skipped" ? null : leaveAt(at, legSeconds);
  const late = mode === "live" && !!leave && now.getTime() >= leave.getTime();
  const parts = [`🕐 ${formatClock(i18n.language, at)}`];
  if (late) parts.push(t("food:fixed.leaveNow"));
  else if (leave) parts.push(t("food:fixed.leaveBy", { time: formatClock(i18n.language, leave) }));
  return (
    <Text testID="fixed-line" style={{ color: late ? c.danger : c.accent, fontSize: 13, fontWeight: "600" }}>
      {parts.join(" · ")}
    </Text>
  );
}

/** Set, change or clear a stop's fixed time (a reservation, a show) on its route's day. */
export function FixedTimeEditor({ stop, day, onSaved, readOnly }: { stop: Stop; day: string; onSaved: (s: Stop) => void; readOnly?: boolean }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(stop.fixedAt ? clockOf(new Date(stop.fixedAt)) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const at = stop.fixedAt ? new Date(stop.fixedAt) : null;

  const save = async (fixedAt: string | null) => {
    setBusy(true);
    setError("");
    try {
      onSaved(await routeApi.updateStop(stop.id, { fixedAt }));
      setEditing(false);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  const minutes = parseClock(text);

  if (readOnly) return at ? <Body muted>🕐 {formatClock(i18n.language, at)}</Body> : null;
  return (
    <View testID="fixed-time" style={{ gap: 8 }}>
      <Text style={{ color: c.text, fontSize: 15, fontWeight: "600" }}>{t("food:fixed.title")}</Text>
      {!editing ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {at ? <Text style={{ color: c.accent, fontSize: 16, fontWeight: "700" }}>🕐 {formatClock(i18n.language, at)}</Text> : <Body muted>{t("food:fixed.none")}</Body>}
          <Chip label={at ? t("food:fixed.change") : t("food:fixed.set")} onPress={() => setEditing(true)} />
          {at && <Chip label={t("food:fixed.clear")} onPress={() => save(null)} />}
        </View>
      ) : (
        <>
          <Field label={t("food:fixed.time")} value={text} onChangeText={setText} placeholder="19:30" hint={t("food:fixed.hint")} onSubmitEditing={() => minutes != null && save(onDay(day, minutes).toISOString())} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label={t("food:fixed.save")} busy={busy} disabled={minutes == null} onPress={() => save(onDay(day, minutes!).toISOString())} />
            <Chip label={t("common.cancel")} onPress={() => setEditing(false)} />
          </View>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}
