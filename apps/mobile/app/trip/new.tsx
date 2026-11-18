import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { FormScroll } from "@/components/FormScroll";
import { Button, ErrorText, Field, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { addDays, today } from "@/modules/food/route/dates";
import { tripApi, type Transport } from "@/modules/food/trips/api";
import { DayField, TransportPicker } from "@/modules/food/trips/parts";

/** A new trip: its name, first and last day, and how you're getting there (rental car?). */
export default function NewTrip() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const [title, setTitle] = useState("");
  const [startDate, setStart] = useState(addDays(today(), 7));
  const [endDate, setEnd] = useState(addDays(today(), 9));
  const [how, setHow] = useState<{ transport: Transport; rentalCar: boolean }>({ transport: "car", rentalCar: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const trip = await tripApi.create(groupId, { title: title.trim(), startDate, endDate, ...how });
      router.replace({ pathname: "/trip/[id]", params: { id: trip.id } });
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Field label={t("food:trip.name")} value={title} onChangeText={setTitle} placeholder={t("food:trip.namePlaceholder")} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <DayField
          testID="trip-start"
          label={t("food:trip.start")}
          value={startDate}
          onPick={(d) => {
            setStart(d);
            if (endDate < d) setEnd(d);
          }}
        />
        <DayField testID="trip-end" label={t("food:trip.end")} value={endDate} onPick={(d) => setEnd(d < startDate ? startDate : d)} />
      </View>
      <TransportPicker transport={how.transport} rentalCar={how.rentalCar} onChange={setHow} />
      <ErrorText>{error}</ErrorText>
      <Button label={t("food:trip.create")} busy={busy} onPress={save} />
    </FormScroll>
  );
}
