import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Body, Chip, useColors, Text } from "@/components/ui";
import { confirm } from "@/core/platform/confirm";
import { DayPicker } from "../route/DayPicker";
import { isoDay, today } from "../route/dates";
import type { Visit } from "./api";

/** A day as a visit time: noon that day, so it reads as the same day in any nearby time zone. */
const noonOf = (iso: string) => new Date(`${iso}T12:00:00`).toISOString();

/**
 * Who went when. Your own visits can be moved to another day or removed; "went another day" logs a past visit.
 */
export function VisitList({ visits, me, onAdd, onMove, onDelete }: {
  visits: Visit[];
  me: string | null;
  onAdd: (visitedAt?: string) => void;
  onMove: (v: Visit, visitedAt: string) => void;
  onDelete: (v: Visit) => void;
}) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });
  /** The visit whose day is being picked, or "new" for a visit on another day. */
  const [picking, setPicking] = useState<Visit | "new" | null>(null);
  const pickedDay = picking && picking !== "new" ? isoDay(new Date(picking.visitedAt)) : null;

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", marginTop: 6 }}>{t("food:visit.title")}</Text>
      {visits.length === 0 && <Body muted>{t("food:visit.none")}</Body>}
      {visits.map((v) => (
        <View key={v.id} testID="visit-row" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingVertical: 2 }}>
          <Text style={{ color: c.text, fontSize: 15, flexShrink: 1 }}>
            {fmt.format(new Date(v.visitedAt))} · {v.name}
            <Text style={{ color: c.muted }}>{v.fromRoute ? ` · ${t("food:visit.fromRoute")}` : ""}</Text>
          </Text>
          {v.userId === me && (
            <View style={{ flexDirection: "row", gap: 6, marginLeft: "auto" }}>
              <Chip label={t("food:visit.changeDay")} onPress={() => setPicking(v)} />
              <Chip
                label={t("common.delete")}
                onPress={async () => {
                  if (await confirm(t("food:visit.confirmDelete"), t("common.delete"), t("common.cancel"))) onDelete(v);
                }}
              />
            </View>
          )}
        </View>
      ))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label={t("food:visit.wentToday")} onPress={() => onAdd()} />
        <Chip label={t("food:visit.wentOtherDay")} onPress={() => setPicking("new")} />
      </View>
      <DayPicker
        visible={!!picking}
        value={pickedDay}
        onPick={(iso) => {
          if (iso > today()) return;
          if (picking === "new") onAdd(noonOf(iso));
          else if (picking) onMove(picking, noonOf(iso));
        }}
        onClose={() => setPicking(null)}
      />
    </View>
  );
}
