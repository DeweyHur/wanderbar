import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, View } from "react-native";
import { Chip, useColors, Text } from "@/components/ui";
import { addDays, dayLabel, monthGrid, shiftMonth, today } from "./dates";

/** Pick a day: quick chips for the next few days, or any day on a month calendar. */
export function DayPicker({ visible, value, onPick, onClose }: { visible: boolean; value?: string | null; onPick: (iso: string) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const now = today();
  const [month, setMonth] = useState(value ?? now);
  const quick = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(now, n));
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "narrow" }).format(new Date(2026, 10, 2 + i)),
  );
  const pick = (iso: string) => {
    onPick(iso);
    onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable
          testID="day-picker"
          // A phone-width sheet, centered on wide screens (a full-width calendar grows taller than the window).
          style={{ backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 28, gap: 12, width: "100%", maxWidth: 480, alignSelf: "center" }}
        >
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>{t("food:date.pick")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {quick.map((d) => (
              <Chip key={d} label={dayLabel(t, i18n.language, d)} selected={value === d} onPress={() => pick(d)} />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("food:date.prevMonth")} hitSlop={10} onPress={() => setMonth(shiftMonth(month, -1))}>
              <Text style={{ color: c.accent, fontSize: 22, paddingHorizontal: 8 }}>‹</Text>
            </Pressable>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "600" }}>
              {new Intl.DateTimeFormat(i18n.language, { year: "numeric", month: "long" }).format(new Date(`${month.slice(0, 7)}-01T12:00:00`))}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t("food:date.nextMonth")} hitSlop={10} onPress={() => setMonth(shiftMonth(month, 1))}>
              <Text style={{ color: c.accent, fontSize: 22, paddingHorizontal: 8 }}>›</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row" }}>
            {weekdays.map((w, i) => (
              <Text key={i} style={{ flex: 1, textAlign: "center", color: c.muted, fontSize: 12 }}>
                {w}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {monthGrid(month).map((d, i) => (
              <View key={d ?? `pad-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1.2, padding: 2 }}>
                {d && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={d}
                    onPress={() => pick(d)}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: d === value ? c.accent : "transparent",
                      borderWidth: d === now ? 1 : 0,
                      borderColor: c.accent,
                    }}
                  >
                    <Text style={{ color: d === value ? "#fff" : d < now ? c.muted : c.text, fontSize: 15 }}>{Number(d.slice(8))}</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
