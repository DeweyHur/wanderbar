import { formatPrice, parsePrice, priceInput } from "@wanderbar/route";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import { PhotoStrip } from "@/core/photos/PhotoStrip";
import { confirm } from "@/core/platform/confirm";
import { useSession } from "@/core/session";
import { restaurantApi, type MenuDetail } from "@/modules/food/restaurants/api";
import { RatingBadge, StarInput, Stars } from "@/modules/food/restaurants/Stars";
import { FormScroll } from "@/components/FormScroll";

/** One menu: rate it (half stars) with a short review, read the group's reviews, edit name and price. */
export default function MenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.id : null;
  const [m, setM] = useState<MenuDetail | null>(null);
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState("");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const show = (d: MenuDetail) => {
    setM(d);
    setStars(d.mine?.stars ?? 0);
    setReview(d.mine?.review ?? "");
  };

  useFocusEffect(
    useCallback(() => {
      restaurantApi
        .getMenu(id)
        .then(show)
        .catch((e) => setError(errorText(t, e)));
    }, [id, t]),
  );

  if (!m)
    return error ? (
      <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}>
        <ErrorText>{error}</ErrorText>
      </View>
    ) : (
      <Loading />
    );

  const run = async (p: Promise<MenuDetail>, done?: string) => {
    setBusy(true);
    setError("");
    try {
      show(await p);
      setNotice(done ?? "");
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const others = m.ratings.filter((r) => r.userId !== me);

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: m.name }} />
      <Card testID="menu-info">
        <Pressable accessibilityRole="link" onPress={() => router.back()}>
          <Text style={{ color: c.accent, fontSize: 14, fontWeight: "600" }}>{m.restaurant.name}</Text>
        </Pressable>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{m.name}</Text>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          {m.priceMinor != null && <Body>{formatPrice(m.priceMinor, m.currency, i18n.language)}</Body>}
          {m.rating.count ? <RatingBadge rating={m.rating} /> : <Body muted>{t("food:rating.none")}</Body>}
        </View>
      </Card>

      <PhotoStrip itemId={m.id} />

      <Text style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>{t("food:rating.yours")}</Text>
      <StarInput value={stars} onChange={setStars} />
      <Field label={t("food:rating.review")} value={review} onChangeText={setReview} placeholder={t("food:rating.reviewPlaceholder")} multiline />
      <Button label={t("food:rating.save")} busy={busy} disabled={stars === 0} onPress={() => run(restaurantApi.rate(m.id, stars, review), t("food:rating.saved"))} />
      {m.mine && <Chip label={t("food:rating.remove")} onPress={() => run(restaurantApi.unrate(m.id))} />}
      {notice ? <Body muted>{notice}</Body> : null}
      <ErrorText>{error}</ErrorText>

      {others.length > 0 && <Text style={{ color: c.text, fontSize: 18, fontWeight: "700", marginTop: 8 }}>{t("food:rating.group")}</Text>}
      {others.map((r) => (
        <Card key={r.userId} testID="review">
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: c.text, fontWeight: "600" }}>{r.name}</Text>
            <Stars value={r.stars} />
          </View>
          {r.review ? <Body>{r.review}</Body> : null}
          <Text style={{ color: c.muted, fontSize: 12 }}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(r.updatedAt))}</Text>
        </Card>
      ))}

      <View style={{ flexDirection: "row", marginTop: 10 }}>
        <Chip label={t("food:menu.edit")} selected={editing} onPress={() => setEditing(!editing)} />
      </View>
      {editing && (
        <EditMenu
          m={m}
          onSave={async (edit) => {
            try {
              await restaurantApi.updateMenu(m.id, edit);
              show(await restaurantApi.getMenu(m.id));
              setEditing(false);
              setNotice(t("food:stop.saved"));
            } catch (e) {
              setError(errorText(t, e));
            }
          }}
          onDelete={async () => {
            if (!(await confirm(t("food:menu.confirmDelete", { name: m.name }), t("common.delete"), t("common.cancel")))) return;
            try {
              await restaurantApi.deleteMenu(m.id);
              router.back();
            } catch (e) {
              setError(errorText(t, e));
            }
          }}
        />
      )}
    </FormScroll>
  );
}

function EditMenu({ m, onSave, onDelete }: { m: MenuDetail; onSave: (e: { name: string; priceMinor: number | null }) => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(m.name);
  const [price, setPrice] = useState(m.priceMinor == null ? "" : priceInput(m.priceMinor, m.currency));
  return (
    <Card>
      <Field label={t("food:menu.name")} value={name} onChangeText={setName} />
      <Field label={t("food:menu.price", { currency: m.currency })} value={price} onChangeText={setPrice} />
      <Button label={t("food:stop.save")} disabled={!name.trim()} onPress={() => onSave({ name, priceMinor: parsePrice(price, m.currency) })} />
      <View style={{ flexDirection: "row" }}>
        <Chip label={t("food:menu.delete")} onPress={onDelete} />
      </View>
    </Card>
  );
}
