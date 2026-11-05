import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { useSession } from "@/core/session";
import { dishApi, type Dish } from "@/modules/food/dishes/api";
import { CategoryPicker } from "@/modules/food/restaurants/CategoryPicker";
import { RatingBadge, StarInput, Stars } from "@/modules/food/restaurants/Stars";

/** A dish made at home: when it was made, my rating and review, the group's reviews, recipe notes. */
export default function DishScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.id : null;
  const [d, setD] = useState<Dish | null>(null);
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState("");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const show = (x: Dish) => {
    setD(x);
    setStars(x.mine?.stars ?? 0);
    setReview(x.mine?.review ?? "");
  };
  useFocusEffect(
    useCallback(() => {
      dishApi
        .get(id)
        .then(show)
        .catch((e) => setError(errorText(t, e)));
    }, [id, t]),
  );

  if (!d)
    return error ? (
      <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}>
        <ErrorText>{error}</ErrorText>
      </View>
    ) : (
      <Loading />
    );

  const run = async (p: Promise<Dish>, done = "") => {
    setBusy(true);
    setError("");
    try {
      show(await p);
      setNotice(done);
      return true;
    } catch (e) {
      setError(errorText(t, e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });
  const others = d.ratings.filter((r) => r.userId !== me);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: d.name }} />
      <Card testID="dish-info">
        <Text style={{ color: c.accent, fontSize: 13, fontWeight: "700" }}>{t("food:dish.title")}</Text>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{d.name}</Text>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          {d.rating.count ? <RatingBadge rating={d.rating} /> : <Body muted>{t("food:rating.none")}</Body>}
          {d.category ? <Body muted>{t(`food:category.${d.category}`)}</Body> : null}
        </View>
        {d.memo ? <Body>{d.memo}</Body> : null}
      </Card>

      <Text style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>{t("food:dish.madeTitle")}</Text>
      {d.made.length === 0 && <Body muted>{t("food:dish.neverMade")}</Body>}
      {d.made.map((m) => (
        <Pressable
          key={m.id}
          testID="made-row"
          disabled={m.userId !== me}
          onPress={async () => {
            if (await confirm(t("food:visit.confirmDelete"), t("common.delete"), t("common.cancel"))) await run(dishApi.deleteMade(d.id, m.id));
          }}
        >
          <Text style={{ color: c.text, fontSize: 15, paddingVertical: 4 }}>
            {fmt.format(new Date(m.madeAt))} · {m.name}
          </Text>
        </Pressable>
      ))}
      <View style={{ flexDirection: "row" }}>
        <Chip label={t("food:dish.madeToday")} onPress={() => run(dishApi.made(d.id), t("food:dish.madeAdded"))} />
      </View>

      <Text style={{ color: c.text, fontSize: 18, fontWeight: "700", marginTop: 6 }}>{t("food:rating.yours")}</Text>
      <StarInput value={stars} onChange={setStars} />
      <Field label={t("food:rating.review")} value={review} onChangeText={setReview} placeholder={t("food:rating.reviewPlaceholder")} multiline />
      <Button label={t("food:rating.save")} busy={busy} disabled={stars === 0} onPress={() => run(dishApi.rate(d.id, stars, review), t("food:rating.saved"))} />
      {d.mine && <Chip label={t("food:rating.remove")} onPress={() => run(dishApi.unrate(d.id))} />}
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
        </Card>
      ))}

      <View style={{ flexDirection: "row", marginTop: 10 }}>
        <Chip label={t("food:dish.edit")} selected={editing} onPress={() => setEditing(!editing)} />
      </View>
      {editing && (
        <EditDish
          d={d}
          onSave={async (edit) => (await run(dishApi.update(d.id, edit), t("food:stop.saved"))) && setEditing(false)}
          onDelete={async () => {
            if (!(await confirm(t("food:dish.confirmDelete", { name: d.name }), t("common.delete"), t("common.cancel")))) return;
            try {
              await dishApi.remove(d.id);
              router.back();
            } catch (e) {
              setError(errorText(t, e));
            }
          }}
        />
      )}
    </ScrollView>
  );
}

function EditDish({ d, onSave, onDelete }: { d: Dish; onSave: (e: { name: string; category: string | null; memo: string }) => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(d.name);
  const [memo, setMemo] = useState(d.memo);
  const [category, setCategory] = useState(d.category);
  return (
    <Card>
      <Field label={t("food:dish.name")} value={name} onChangeText={setName} />
      <CategoryPicker label={t("food:restaurant.category")} value={category} onChange={setCategory} />
      <Field label={t("food:dish.memo")} value={memo} onChangeText={setMemo} placeholder={t("food:dish.memoPlaceholder")} multiline />
      <Button label={t("food:stop.save")} disabled={!name.trim()} onPress={() => onSave({ name, category, memo })} />
      <View style={{ flexDirection: "row" }}>
        <Chip label={t("food:dish.delete")} onPress={onDelete} />
      </View>
    </Card>
  );
}
