import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Chip } from "@/components/ui";
import { dayLabel, today } from "../route/dates";
import { DayPicker } from "../route/DayPicker";

/** When saving a restaurant: "Want to go" (null) or "Been there" on a day (YYYY-MM-DD, today by default). */
export function BeenChoice({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { t, i18n } = useTranslation();
  const [picking, setPicking] = useState(false);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} testID="been-choice">
      <Chip label={t("food:been.want")} selected={value === null} onPress={() => onChange(null)} />
      <Chip label={t("food:been.been")} selected={value !== null} onPress={() => onChange(value ?? today())} />
      {value !== null && <Chip label={t("food:been.on", { date: dayLabel(t, i18n.language, value) })} onPress={() => setPicking(true)} />}
      <DayPicker visible={picking} value={value} onPick={onChange} onClose={() => setPicking(false)} />
    </View>
  );
}
