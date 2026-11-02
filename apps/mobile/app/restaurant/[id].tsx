import { formatPrice, Links, parsePrice, priceInput } from "@wanderbar/route";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { AddToRoute } from "@/modules/food/restaurants/AddToRoute";
import { CategoryPicker } from "@/modules/food/restaurants/CategoryPicker";
import { restaurantApi, type Menu, type Restaurant } from "@/modules/food/restaurants/api";
import { takeSession, useGoogleAvailable } from "@/modules/food/route/google";
import { HoursBadge } from "@/modules/food/route/HoursBadge";
import { useNow } from "@/modules/food/route/hooks";
import { PlaceSearch } from "@/modules/food/route/PlaceSearch";

/** A saved restaurant: hours, links, its menus with prices, editing, and adding it to a day route. */
export default function RestaurantScreen() {
  const { id, existing } = useLocalSearchParams<{ id: string; existing?: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const now = useNow();
  const googleAvailable = useGoogleAvailable();
  const [r, setR] = useState<Restaurant | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(existing ? t("food:restaurant.alreadySaved") : "");
  const [panel, setPanel] = useState<"none" | "route" | "edit">("none");

  useFocusEffect(
    useCallback(() => {
      restaurantApi
        .get(id)
        .then(setR)
        .catch((e) => setError(errorText(t, e)));
    }, [id, t]),
  );

  if (!r)
    return error ? (
      <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}>
        <ErrorText>{error}</ErrorText>
      </View>
    ) : (
      <Loading />
    );

  const run = async (p: Promise<Restaurant>, done?: string) => {
    setError("");
    try {
      setR(await p);
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError(errorText(t, e));
      return false;
    }
  };

  const remove = async () => {
    if (!(await confirm(t("food:restaurant.confirmDelete", { name: r.name }), t("common.delete"), t("common.cancel")))) return;
    try {
      await restaurantApi.remove(r.id);
      router.back();
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: r.name }} />
      {notice ? <Body muted>{notice}</Body> : null}
      <Card testID="restaurant-info">
        <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{r.name}</Text>
        {r.category ? <Body muted>{t(`food:category.${r.category}`)}</Body> : null}
        <HoursBadge hoursRaw={r.hoursRaw} now={now} />
        {r.address ? <Body>{r.address}</Body> : null}
        {r.memo ? <Body muted>{r.memo}</Body> : null}
      </Card>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label={t("food:restaurant.addToRoute")} selected={panel === "route"} onPress={() => setPanel(panel === "route" ? "none" : "route")} />
        <Chip label={t("food:route.directions")} onPress={() => Linking.openURL(Links.googleDirections(r.name, r.address))} />
        <Chip label="Google Maps" onPress={() => Linking.openURL(r.mapsUrl || Links.googleSearch(r.name, r.address))} />
        <Chip label={t("food:route.yelp")} onPress={() => Linking.openURL(r.yelpUrl || Links.yelpSearch(r.name, r.address))} />
      </View>
      {panel === "route" && <AddToRoute restaurant={r} />}

      <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", marginTop: 6 }}>{t("food:menu.title")}</Text>
      {r.menus.length === 0 && <Body muted>{t("food:menu.empty")}</Body>}
      {r.menus.map((m) => (
        <MenuRow key={m.id} menu={m} locale={i18n.language} onSave={(edit) => run(restaurantApi.updateMenu(m.id, edit))} onDelete={() => run(restaurantApi.deleteMenu(m.id))} />
      ))}
      <NewMenu currency={r.currency} onAdd={(m) => run(restaurantApi.addMenu(r.id, m))} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <Chip label={t("food:restaurant.edit")} selected={panel === "edit"} onPress={() => setPanel(panel === "edit" ? "none" : "edit")} />
        {googleAvailable && !r.googlePlaceId && (
          <Chip label={t("food:restaurant.findOnGoogle")} onPress={() => run(restaurantApi.linkGoogle(r.id), t("food:restaurant.linked"))} />
        )}
        <Chip label={t("food:restaurant.delete")} onPress={remove} />
      </View>
      {panel === "edit" && (
        <EditRestaurant
          r={r}
          googleAvailable={googleAvailable}
          onSave={async (edit) => (await run(restaurantApi.update(r.id, edit), t("food:stop.saved"))) && setPanel("none")}
          onPickGoogle={(placeId) => run(restaurantApi.linkGoogle(r.id, { placeId, sessionToken: takeSession() }), t("food:restaurant.linked"))}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </ScrollView>
  );
}

function MenuRow({ menu, locale, onSave, onDelete }: { menu: Menu; locale: string; onSave: (m: { name: string; priceMinor: number | null }) => Promise<boolean>; onDelete: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(menu.name);
  const [price, setPrice] = useState(menu.priceMinor == null ? "" : priceInput(menu.priceMinor, menu.currency));

  if (!editing)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={menu.name} onPress={() => setEditing(true)}>
        <View testID="menu-row" style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Text style={{ color: c.text, fontSize: 16, flex: 1 }}>{menu.name}</Text>
          <Text style={{ color: menu.priceMinor == null ? c.muted : c.text, fontSize: 16 }}>
            {menu.priceMinor == null ? t("food:menu.noPrice") : formatPrice(menu.priceMinor, menu.currency, locale)}
          </Text>
        </View>
      </Pressable>
    );
  return (
    <Card>
      <Field label={t("food:menu.name")} value={name} onChangeText={setName} />
      <Field label={t("food:menu.price", { currency: menu.currency })} value={price} onChangeText={setPrice} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip
          label={t("food:stop.save")}
          disabled={!name.trim()}
          onPress={async () => (await onSave({ name, priceMinor: parsePrice(price, menu.currency) })) && setEditing(false)}
        />
        <Chip label={t("common.cancel")} onPress={() => setEditing(false)} />
        <Chip label={t("food:menu.delete")} onPress={onDelete} />
      </View>
    </Card>
  );
}

function NewMenu({ currency, onAdd }: { currency: string; onAdd: (m: { name: string; priceMinor: number | null }) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  // Clear right away so the next menu can be typed while this one saves; put it back if saving fails.
  const add = async () => {
    const entry = { name, price };
    setName("");
    setPrice("");
    if (!(await onAdd({ name: entry.name, priceMinor: parsePrice(entry.price, currency) }))) {
      setName((n) => n || entry.name);
      setPrice((p) => p || entry.price);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 2 }}>
          <Field value={name} onChangeText={setName} placeholder={t("food:menu.namePlaceholder")} onSubmitEditing={name.trim() ? add : undefined} />
        </View>
        <View style={{ flex: 1 }}>
          <Field value={price} onChangeText={setPrice} placeholder={t("food:menu.price", { currency })} onSubmitEditing={name.trim() ? add : undefined} />
        </View>
      </View>
      <Button kind="plain" label={t("food:menu.add")} disabled={!name.trim()} onPress={add} />
    </View>
  );
}

function EditRestaurant({
  r,
  googleAvailable,
  onSave,
  onPickGoogle,
}: {
  r: Restaurant;
  googleAvailable: boolean;
  onSave: (edit: Partial<Restaurant>) => void;
  onPickGoogle: (placeId: string) => void;
}) {
  const { t } = useTranslation();
  const now = useNow();
  const [form, setForm] = useState({ name: r.name, address: r.address, hoursRaw: r.hoursRaw, yelpUrl: r.yelpUrl, mapsUrl: r.mapsUrl, memo: r.memo });
  const [category, setCategory] = useState(r.category);
  const [search, setSearch] = useState("");
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Card>
      {googleAvailable && (
        <PlaceSearch
          label={t("food:stop.searchGoogle")}
          hint={t("food:restaurant.relinkHint")}
          value={search}
          onChangeText={setSearch}
          near={r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null}
          onPickSuggestion={(s) => {
            setSearch("");
            onPickGoogle(s.placeId);
          }}
        />
      )}
      <Field label={t("food:stop.name")} value={form.name} onChangeText={set("name")} />
      <CategoryPicker label={t("food:restaurant.category")} value={category} onChange={setCategory} />
      <Field label={t("food:stop.address")} value={form.address} onChangeText={set("address")} />
      <Field label={t("food:stop.hours")} value={form.hoursRaw} onChangeText={set("hoursRaw")} hint={t("food:stop.hoursHint")} multiline />
      <HoursBadge hoursRaw={form.hoursRaw} now={now} />
      <Field label={t("food:restaurant.yelpUrl")} value={form.yelpUrl} onChangeText={set("yelpUrl")} />
      <Field label={t("food:stop.mapsUrl")} value={form.mapsUrl} onChangeText={set("mapsUrl")} />
      <Field label={t("food:stop.memo")} value={form.memo} onChangeText={set("memo")} multiline />
      <Button label={t("food:stop.save")} disabled={!form.name.trim()} onPress={() => onSave({ ...form, category })} />
    </Card>
  );
}
