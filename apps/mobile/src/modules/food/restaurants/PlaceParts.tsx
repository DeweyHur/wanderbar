import { PLACE_TYPE_ICON, PLACE_TYPES, type PlaceType } from "@wanderbar/route";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Body, Button, Chip, Field, Text, useColors } from "@/components/ui";
import { DayField } from "../trips/parts";
import { today } from "../route/dates";
import type { PlaceEvent, Restaurant } from "./api";
import { Reviews } from "./Reviews";
import { RatingBadge } from "./Stars";

/** "🏞️ Sight" etc. */
export const placeTypeLabel = (t: (k: string) => string, type: PlaceType) => `${PLACE_TYPE_ICON[type]} ${t(`food:place.type.${type}`)}`;

/** Pick what kind of place it is. */
export function PlaceTypePicker({ value, onChange }: { value: PlaceType; onChange: (t: PlaceType) => void }) {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <View style={{ gap: 6 }} testID="place-type-picker">
      <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600" }}>{t("food:place.typeLabel")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {PLACE_TYPES.map((k) => (
          <Chip key={k} label={placeTypeLabel(t, k)} selected={value === k} onPress={() => onChange(k)} />
        ))}
      </View>
    </View>
  );
}

/**
 * A venue's events: what you saw and when, newest first; tap one to see and give ratings.
 * Anyone adds; whoever added one (or the owner) removes it.
 */
export function EventList({
  place,
  me,
  onAdd,
  onRate,
  onUnrate,
  onDelete,
}: {
  place: Restaurant;
  me: string | null;
  onAdd: (e: { name: string; onDate: string | null }) => Promise<boolean>;
  onRate: (ev: PlaceEvent, stars: number, review: string) => Promise<unknown>;
  onUnrate: (ev: PlaceEvent) => Promise<unknown>;
  onDelete: (ev: PlaceEvent) => void;
}) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [day, setDay] = useState<string>(today());
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" });
  const add = async () => {
    const entry = name;
    setName("");
    if (!(await onAdd({ name: entry.trim(), onDate: day }))) setName((n) => n || entry);
  };
  return (
    <View style={{ gap: 10 }} testID="event-list">
      <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", marginTop: 6 }}>🎟️ {t("food:place.events")}</Text>
      {place.events.length === 0 && <Body muted>{t("food:place.noEvents")}</Body>}
      {place.events.map((ev) => (
        <View key={ev.id} testID="event-row" style={{ gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Pressable accessibilityRole="button" accessibilityLabel={ev.name} onPress={() => setOpen(open === ev.id ? null : ev.id)}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: c.text, fontSize: 16, flex: 1, fontWeight: "600" }}>{ev.name}</Text>
              {ev.onDate ? <Text style={{ color: c.muted, fontSize: 14 }}>{fmt.format(new Date(`${ev.onDate}T12:00:00Z`))}</Text> : null}
            </View>
            {ev.rating.count ? <RatingBadge rating={ev.rating} /> : <Text style={{ color: c.muted, fontSize: 14 }}>{t("food:rating.none")}</Text>}
          </Pressable>
          {open === ev.id && (
            <View style={{ gap: 8 }}>
              <Reviews title={null} ratings={ev.reviews} me={me} onSave={(s, r) => onRate(ev, s, r)} onRemove={() => onUnrate(ev)} />
              {ev.createdBy === me && (
                <View style={{ flexDirection: "row" }}>
                  <Chip label={t("food:place.deleteEvent")} onPress={() => onDelete(ev)} />
                </View>
              )}
            </View>
          )}
        </View>
      ))}
      <Field value={name} onChangeText={setName} placeholder={t("food:place.eventPlaceholder")} onSubmitEditing={name.trim() ? add : undefined} />
      <View style={{ flexDirection: "row" }}>
        <DayField label={t("food:place.eventDay")} value={day} onPick={setDay} />
      </View>
      <Button kind="plain" label={t("food:place.addEvent")} disabled={!name.trim()} onPress={add} />
    </View>
  );
}
