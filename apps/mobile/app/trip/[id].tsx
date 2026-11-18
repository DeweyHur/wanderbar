import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { FormScroll } from "@/components/FormScroll";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, Text, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { dayLabel } from "@/modules/food/route/dates";
import type { PlaceDetails } from "@/modules/food/route/google";
import { PlaceSearch } from "@/modules/food/route/PlaceSearch";
import { nights, tripApi, TRANSPORT_ICON, type Hotel, type Trip, type TripEdit } from "@/modules/food/trips/api";
import { DayField, rangeLabel, TransportPicker } from "@/modules/food/trips/parts";

/** A trip: its dates and how you get there, the hotels you stay at (by nights), and a route for each day. */
export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const show = (next: Trip) => {
    setTrip(next);
    setTitle(next.title);
  };
  useFocusEffect(
    useCallback(() => {
      tripApi.get(id).then(show, (e) => setError(errorText(t, e)));
    }, [id, t]),
  );
  const run = (p: Promise<Trip>) =>
    p.then(
      (next) => {
        setError("");
        show(next);
      },
      (e) => setError(errorText(t, e)),
    );
  const edit = (e: TripEdit) => run(tripApi.update(id, e));

  if (!trip) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  const name = trip.title || t("food:trip.untitled");

  return (
    <FormScroll testID="trip-screen" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `${TRANSPORT_ICON[trip.transport]} ${name}` }} />
      <Field
        label={t("food:trip.name")}
        value={title}
        onChangeText={setTitle}
        placeholder={t("food:trip.namePlaceholder")}
        onSubmitEditing={() => title.trim() !== trip.title && edit({ title })}
        onBlur={() => title.trim() !== trip.title && edit({ title })}
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <DayField testID="trip-start" label={t("food:trip.start")} value={trip.startDate} onPick={(d) => edit({ startDate: d, endDate: trip.endDate < d ? d : trip.endDate })} />
        <DayField testID="trip-end" label={t("food:trip.end")} value={trip.endDate} onPick={(d) => edit({ endDate: d })} />
      </View>
      <TransportPicker transport={trip.transport} rentalCar={trip.rentalCar} onChange={(h) => edit(h)} />
      <ErrorText>{error}</ErrorText>

      <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", marginTop: 6 }}>🏨 {t("food:trip.hotels")}</Text>
      {trip.hotels.length === 0 && <Body muted>{t("food:trip.noHotels")}</Body>}
      {trip.hotels.map((h) => (
        <HotelRow key={h.id} hotel={h} onChange={run} />
      ))}
      <AddHotel trip={trip} onAdded={run} />

      <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", marginTop: 6 }}>🗺️ {t("food:trip.days")}</Text>
      {trip.days.map((d, i) => (
        <Pressable key={d.planId} accessibilityRole="button" onPress={() => router.push({ pathname: "/plan/[id]", params: { id: d.planId } })}>
          <Card testID="trip-day">
            <Text style={{ color: c.text, fontSize: 17, fontWeight: "600" }}>
              {t("food:trip.dayN", { n: i + 1 })} · {d.date ? dayLabel(t, i18n.language, d.date) : ""}
              {d.title ? ` · ${d.title}` : ""}
            </Text>
            <Body muted>
              {[
                t("food:route.progress", { finished: d.finished, total: d.total }),
                d.hotel ? t("food:trip.endsAt", { name: d.hotel.name }) : i === trip.days.length - 1 ? t("food:trip.headingHome") : t("food:trip.noHotelTonight"),
              ].join(" · ")}
            </Body>
          </Card>
        </Pressable>
      ))}

      <View style={{ flexDirection: "row", marginTop: 8 }}>
        <Chip
          label={t("food:trip.delete")}
          onPress={async () => {
            if (!(await confirm(t("food:trip.confirmDelete"), t("common.delete"), t("common.cancel")))) return;
            await tripApi.remove(trip.id).then(() => router.back(), (e) => setError(errorText(t, e)));
          }}
        />
      </View>
    </FormScroll>
  );
}

/** A stay: check-in and check-out can be moved; the nights are counted. */
function HotelRow({ hotel, onChange }: { hotel: Hotel; onChange: (p: Promise<Trip>) => void }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  return (
    <Card testID="hotel-card">
      <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }}>{hotel.name}</Text>
      {hotel.address ? <Body muted>{hotel.address}</Body> : null}
      <Body muted>
        {rangeLabel(i18n.language, hotel.checkIn, hotel.checkOut)} · {t("food:trip.nights", { count: nights(hotel.checkIn, hotel.checkOut) })}
      </Body>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <DayField label={t("food:trip.checkIn")} value={hotel.checkIn} onPick={(d) => onChange(tripApi.updateHotel(hotel.id, { checkIn: d }))} />
        <DayField label={t("food:trip.checkOut")} value={hotel.checkOut} onPick={(d) => onChange(tripApi.updateHotel(hotel.id, { checkOut: d }))} />
      </View>
      <View style={{ flexDirection: "row" }}>
        <Chip label={t("common.delete")} onPress={() => onChange(tripApi.removeHotel(hotel.id))} />
      </View>
    </Card>
  );
}

/** Find the hotel (Google search, or just type its name) and pick the nights you stay there. */
function AddHotel({ trip, onAdded }: { trip: Trip; onAdded: (p: Promise<Trip>) => void }) {
  const { t } = useTranslation();
  const c = useColors();
  // The next stay starts where the last one ended.
  const from = trip.hotels.length ? trip.hotels[trip.hotels.length - 1].checkOut : trip.startDate;
  const firstIn = from < trip.endDate ? from : trip.startDate;
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<PlaceDetails | null>(null);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const inDay = checkIn ?? firstIn;
  // By default you stay until the end of the trip.
  const outDay = checkOut ?? trip.endDate;

  const save = () => {
    const name = (place?.name || query).trim();
    if (!name) return;
    onAdded(
      tripApi
        .addHotel(trip.id, {
          name,
          address: place?.address ?? "",
          lat: place?.lat ?? null,
          lng: place?.lng ?? null,
          googlePlaceId: place?.googlePlaceId ?? "",
          mapsUrl: place?.mapsUrl ?? "",
          checkIn: inDay,
          checkOut: outDay,
        })
        .then((next) => {
          setQuery("");
          setPlace(null);
          setCheckIn(null);
          setCheckOut(null);
          return next;
        }),
    );
  };

  return (
    <Card testID="add-hotel">
      <PlaceSearch
        label={t("food:trip.addHotel")}
        value={query}
        onChangeText={(s) => {
          setQuery(s);
          setPlace(null);
        }}
        onPick={(d) => {
          setPlace(d);
          setQuery(d.name);
        }}
        placeholder={t("food:trip.hotelPlaceholder")}
      />
      {place?.address ? <Body muted>{place.address}</Body> : null}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <DayField label={t("food:trip.checkIn")} value={inDay} onPick={setCheckIn} />
        <DayField label={t("food:trip.checkOut")} value={outDay} onPick={setCheckOut} />
      </View>
      <Text style={{ color: c.muted, fontSize: 13 }}>{t("food:trip.nights", { count: Math.max(0, nights(inDay, outDay)) })}</Text>
      <Button kind="plain" label={t("food:trip.saveHotel")} disabled={!(place?.name || query).trim()} onPress={save} />
    </Card>
  );
}
