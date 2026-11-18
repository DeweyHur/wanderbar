import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Chip, Text, useColors } from "@/components/ui";
import { DayPicker } from "../route/DayPicker";
import { dayLabel } from "../route/dates";
import { TRANSPORT_ICON, TRANSPORTS, type Transport } from "./api";

/** How you're getting there, and (when not driving your own car) whether you'll have a rental car. */
export function TransportPicker({
  transport,
  rentalCar,
  onChange,
}: {
  transport: Transport;
  rentalCar: boolean;
  onChange: (next: { transport: Transport; rentalCar: boolean }) => void;
}) {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.muted, fontSize: 14, fontWeight: "700" }}>{t("food:trip.howGetThere")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} testID="trip-transport">
        {TRANSPORTS.map((k) => (
          <Chip
            key={k}
            icon={TRANSPORT_ICON[k]}
            label={t(`food:trip.transport.${k}`)}
            selected={transport === k}
            onPress={() => onChange({ transport: k, rentalCar: k === "car" ? false : rentalCar })}
          />
        ))}
      </View>
      {transport !== "car" && (
        <>
          <Text style={{ color: c.muted, fontSize: 14, fontWeight: "700" }}>{t("food:trip.rentalQuestion")}</Text>
          <View style={{ flexDirection: "row", gap: 6 }} testID="trip-rental">
            <Chip icon="🚙" label={t("food:trip.rentalYes")} selected={rentalCar} onPress={() => onChange({ transport, rentalCar: true })} />
            <Chip icon="🚶" label={t("food:trip.rentalNo")} selected={!rentalCar} onPress={() => onChange({ transport, rentalCar: false })} />
          </View>
        </>
      )}
    </View>
  );
}

/** A labelled day that opens the calendar. */
export function DayField({ label, value, onPick, testID }: { label: string; value: string; onPick: (d: string) => void; testID?: string }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4, flex: 1 }} testID={testID}>
      <Text style={{ color: c.muted, fontSize: 14, fontWeight: "700" }}>{label}</Text>
      <Chip label={`📅 ${dayLabel(t, i18n.language, value)}`} accessibilityLabel={label} onPress={() => setOpen(true)} />
      <DayPicker visible={open} value={value} onPick={onPick} onClose={() => setOpen(false)} />
    </View>
  );
}

/** "Dec 1 – Dec 4" (plus the year when it isn't this one). */
export function rangeLabel(locale: string, from: string, to: string) {
  const y = new Date().getFullYear().toString();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", ...(from.slice(0, 4) !== y || to.slice(0, 4) !== y ? { year: "numeric" } : {}) };
  const f = new Intl.DateTimeFormat(locale, opts);
  return from === to ? f.format(new Date(`${from}T12:00:00`)) : `${f.format(new Date(`${from}T12:00:00`))} – ${f.format(new Date(`${to}T12:00:00`))}`;
}
