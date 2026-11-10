import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Body, Button, Chip, Field } from "@/components/ui";

/** "YYYY-MM-DD" for today (or n days ago) on this device. */
export function dayString(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A date field with Today / Yesterday shortcuts. Controlled when `value` is given; otherwise it has its own button. */
export function PlayDateField({ value, onChange, label }: { value: string; onChange: (s: string) => void; label: string }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      <Field label={label} value={value} onChangeText={onChange} placeholder="2026-11-07" />
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Chip label={t("boardgame:play.today")} selected={value === dayString(0)} onPress={() => onChange(value === dayString(0) ? "" : dayString(0))} />
        <Chip label={t("boardgame:play.yesterday")} selected={value === dayString(1)} onPress={() => onChange(value === dayString(1) ? "" : dayString(1))} />
      </View>
    </View>
  );
}

/** On a game's page: record a play on some day. */
export function PlayedOn({ onLog, busy }: { onLog: (date: string) => Promise<boolean>; busy?: boolean }) {
  const { t } = useTranslation();
  const [date, setDate] = useState("");
  return (
    <View style={{ gap: 8 }} testID="played-on">
      <Body muted>{t("boardgame:play.hint")}</Body>
      <PlayDateField value={date} onChange={setDate} label={t("boardgame:play.field")} />
      {date.trim() ? <Button kind="plain" label={t("boardgame:play.add")} busy={busy} onPress={async () => (await onLog(date.trim())) && setDate("")} /> : null}
    </View>
  );
}
