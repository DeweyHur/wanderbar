import { formatPrice, Links, parsePrice } from "@wanderbar/route";
import { Stack, router, useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors } from "@/components/ui";
import { apiImage } from "@/core/api";
import { PhotoStrip } from "@/core/photos/PhotoStrip";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { useSession } from "@/core/session";
import { takeSession, useGoogleAvailable } from "../route/google";
import { HoursBadge } from "../route/HoursBadge";
import { useNow } from "../route/hooks";
import { PlaceSearch } from "../route/PlaceSearch";
import { ShareMenu } from "../route/ShareMenu";
import { AddToRoute } from "./AddToRoute";
import { CategoryPicker } from "./CategoryPicker";
import { restaurantApi, type Menu, type Restaurant } from "./api";
import { RatingBadge } from "./Stars";

/**
 * A restaurant: cover photo, hours, links, menus with prices and ratings, visits, sharing and editing.
 * The restaurant page and a restaurant stop in a day route both show this; the stop adds its route
 * controls on top (`top`) instead of "Add to route".
 */
export function RestaurantView({ id, existing, top, refreshKey }: { id: string; existing?: boolean; top?: ReactNode; refreshKey?: string }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const now = useNow();
  const googleAvailable = useGoogleAvailable();
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.id : null;
  const [r, setR] = useState<Restaurant | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(existing ? t("food:restaurant.alreadySaved") : "");
  const [panel, setPanel] = useState<"none" | "route" | "edit">("none");
  const [photoOk, setPhotoOk] = useState(true);
  const [reloads, setReloads] = useState(0);

  // Reload on focus and whenever the caller says something changed (e.g. the route stop was marked done).
  useFocusEffect(
    useCallback(() => {
      restaurantApi
        .get(id)
        .then(setR)
        .catch((e) => setError(errorText(t, e)));
    }, [id, t, refreshKey, reloads]),
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

  const dateFmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: r.name }} />
      {(r.coverPhotoId || r.hasPhoto) && photoOk && (
        <Image
          testID="restaurant-photo"
          // The group's own newest photo first, else Google's.
          source={apiImage(r.coverPhotoId ? `/api/photos/${r.coverPhotoId}` : `/api/restaurants/${r.id}/photo`)}
          onError={() => setPhotoOk(false)}
          style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: c.card }}
          resizeMode="cover"
        />
      )}
      {top}
      {notice ? <Body muted>{notice}</Body> : null}
      <Card testID="restaurant-info">
        <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{r.name}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <RatingBadge rating={r.rating} />
          {r.category ? <Body muted>{t(`food:category.${r.category}`)}</Body> : null}
        </View>
        <HoursBadge hoursRaw={r.hoursRaw} now={now} />
        {r.address ? <Body>{r.address}</Body> : null}
        {r.memo ? <Body muted>{r.memo}</Body> : null}
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Link label="Google Maps" onPress={() => Linking.openURL(Links.googlePlace(r.name, r.address, r.googlePlaceId, r.mapsUrl))} />
          <Link label={t("food:route.yelp")} onPress={() => Linking.openURL(r.yelpUrl || Links.yelpSearch(r.name, r.address))} />
        </View>
      </Card>

      <PhotoStrip itemId={r.id} onChange={() => setReloads((n) => n + 1)} />

      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <ShareMenu place={r} onNotice={setNotice} kind="plain" />
        </View>
        {!top && (
          <View style={{ flex: 1 }}>
            <Button kind="plain" label={t("food:restaurant.addToRoute")} onPress={() => setPanel(panel === "route" ? "none" : "route")} />
          </View>
        )}
      </View>
      {panel === "route" && <AddToRoute restaurant={r} />}

      <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", marginTop: 6 }}>{t("food:menu.title")}</Text>
      {r.menus.length === 0 && <Body muted>{t("food:menu.empty")}</Body>}
      {r.menus.map((m) => (
        <MenuRow key={m.id} menu={m} locale={i18n.language} />
      ))}
      <NewMenu currency={r.currency} onAdd={(m) => run(restaurantApi.addMenu(r.id, m))} />

      <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", marginTop: 6 }}>{t("food:visit.title")}</Text>
      {r.visits.length === 0 && <Body muted>{t("food:visit.none")}</Body>}
      {r.visits.map((v) => (
        <Pressable
          key={v.id}
          testID="visit-row"
          disabled={v.userId !== me}
          onPress={async () => {
            if (await confirm(t("food:visit.confirmDelete"), t("common.delete"), t("common.cancel"))) await run(restaurantApi.deleteVisit(v.id));
          }}
        >
          <Text style={{ color: c.text, fontSize: 15, paddingVertical: 4 }}>
            {dateFmt.format(new Date(v.visitedAt))} · {v.name}
            <Text style={{ color: c.muted }}>{v.fromRoute ? ` · ${t("food:visit.fromRoute")}` : ""}</Text>
          </Text>
        </Pressable>
      ))}
      <View style={{ flexDirection: "row" }}>
        <Chip label={t("food:visit.wentToday")} onPress={() => run(restaurantApi.addVisit(r.id), t("food:visit.added"))} />
      </View>

      <View style={{ flexDirection: "row", marginTop: 10 }}>
        <Chip label={t("food:restaurant.edit")} selected={panel === "edit"} onPress={() => setPanel(panel === "edit" ? "none" : "edit")} />
      </View>
      {panel === "edit" && (
        <EditRestaurant
          r={r}
          googleAvailable={googleAvailable}
          onSave={async (edit) => (await run(restaurantApi.update(r.id, edit), t("food:stop.saved"))) && setPanel("none")}
          onPickGoogle={(placeId) => run(restaurantApi.linkGoogle(r.id, { placeId, sessionToken: takeSession() }), t("food:restaurant.linked"))}
          onFindGoogle={() => run(restaurantApi.linkGoogle(r.id), t("food:restaurant.linked"))}
          onDelete={remove}
        />
      )}
      <ErrorText>{error}</ErrorText>
    </ScrollView>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      <Text style={{ color: c.accent, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/** Name, price, group average and my stars; opens the menu page (rate, reviews, edit). */
function MenuRow({ menu, locale }: { menu: Menu; locale: string }) {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={menu.name} onPress={() => router.push({ pathname: "/menu/[id]", params: { id: menu.id } })}>
      <View testID="menu-row" style={{ gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <Text style={{ color: c.text, fontSize: 16, flex: 1 }}>{menu.name}</Text>
          <Text style={{ color: menu.priceMinor == null ? c.muted : c.text, fontSize: 16 }}>
            {menu.priceMinor == null ? t("food:menu.noPrice") : formatPrice(menu.priceMinor, menu.currency, locale)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          {menu.rating.count ? <RatingBadge rating={menu.rating} /> : <Text style={{ color: c.muted, fontSize: 14 }}>{t("food:rating.none")}</Text>}
          {menu.myStars != null && <Text style={{ color: c.muted, fontSize: 13 }}>{t("food:rating.mine", { stars: menu.myStars })}</Text>}
        </View>
      </View>
    </Pressable>
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
  onFindGoogle,
  onDelete,
}: {
  r: Restaurant;
  googleAvailable: boolean;
  onSave: (edit: Partial<Restaurant>) => void;
  onPickGoogle: (placeId: string) => void;
  onFindGoogle: () => void;
  onDelete: () => void;
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {googleAvailable && !r.googlePlaceId && <Chip label={t("food:restaurant.findOnGoogle")} onPress={onFindGoogle} />}
        <Chip label={t("food:restaurant.delete")} onPress={onDelete} />
      </View>
    </Card>
  );
}
