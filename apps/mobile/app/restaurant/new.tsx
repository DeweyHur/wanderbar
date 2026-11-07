import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Body, Button, ErrorText, Field, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import { BeenChoice } from "@/modules/food/restaurants/BeenChoice";
import { CategoryPicker } from "@/modules/food/restaurants/CategoryPicker";
import { restaurantApi, type NewRestaurant } from "@/modules/food/restaurants/api";
import { takeSession, useGoogleAvailable } from "@/modules/food/route/google";
import { PlaceSearch } from "@/modules/food/route/PlaceSearch";
import { FormScroll } from "@/components/FormScroll";

/** Add a restaurant: pick it from Google search, or type it in (the server still tries to find it on Google). */
export default function NewRestaurant() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const googleAvailable = useGoogleAvailable();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [visitedOn, setVisitedOn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (r: NewRestaurant) => {
    setBusy(true);
    setError("");
    try {
      const { restaurant, created } = await restaurantApi.create(groupId, { ...r, ...(visitedOn ? { visitedOn } : {}) });
      router.replace({ pathname: "/restaurant/[id]", params: { id: restaurant.id, ...(created ? {} : { existing: "1" }) } });
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t("food:restaurant.add") }} />
      <BeenChoice value={visitedOn} onChange={setVisitedOn} />
      {googleAvailable && (
        <>
          <PlaceSearch
            label={t("food:stop.searchGoogle")}
            hint={t("food:restaurant.searchGoogleHint")}
            value={search}
            onChangeText={setSearch}
            onPickSuggestion={(s) => save({ googlePlaceId: s.placeId, sessionToken: takeSession(), category })}
          />
          <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600", marginTop: 8 }}>{t("food:restaurant.orType")}</Text>
        </>
      )}
      <Field label={t("food:stop.name")} value={name} onChangeText={setName} />
      <Field label={t("food:stop.address")} value={address} onChangeText={setAddress} />
      <CategoryPicker label={t("food:restaurant.category")} value={category} onChange={setCategory} />
      <Button label={t("food:stop.save")} busy={busy} disabled={!name.trim()} onPress={() => save({ name, address, category })} />
      {busy && <Body muted>{t("food:restaurant.saving")}</Body>}
      <ErrorText>{error}</ErrorText>
    </FormScroll>
  );
}
