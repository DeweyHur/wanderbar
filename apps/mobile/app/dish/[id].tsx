import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors, Text } from "@/components/ui";
import { api, type GroupDetail, type Member } from "@/core/api";
import { errorText } from "@/core/errors";
import { PhotoStrip } from "@/core/photos/PhotoStrip";
import { confirm } from "@/core/platform/confirm";
import { useSession } from "@/core/session";
import { dishApi, type Dish } from "@/modules/food/dishes/api";
import { CategoryPicker } from "@/modules/food/restaurants/CategoryPicker";
import { Reviews } from "@/modules/food/restaurants/Reviews";
import { RatingBadge } from "@/modules/food/restaurants/Stars";
import { FormScroll } from "@/components/FormScroll";

/** A dish made at home: when it was made, my rating and review, the group's reviews, recipe notes. */
export default function DishScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.id : null;
  const [d, setD] = useState<Dish | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingMade, setEditingMade] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const show = (x: Dish) => {
    setD(x);
  };
  useFocusEffect(
    useCallback(() => {
      dishApi
        .get(id)
        .then((x) => {
          show(x);
          api<GroupDetail>(`/api/groups/${x.groupId}`).then((g) => setMembers(g.members), () => {});
        })
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
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
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

      <PhotoStrip itemId={d.id} onChange={() => dishApi.get(d.id).then(show, () => {})} />

      <Text style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>{t("food:dish.madeTitle")}</Text>
      {d.made.length === 0 && <Body muted>{t("food:dish.neverMade")}</Body>}
      {d.made.map((m) => (
        <View key={m.id} testID="made-row">
          <Pressable accessibilityRole="button" onPress={() => setEditingMade(editingMade === m.id ? null : m.id)}>
            <Text style={{ color: c.text, fontSize: 15, paddingVertical: 4 }}>
              {fmt.format(new Date(m.madeAt))} · {m.name} <Text style={{ color: c.muted }}>✎</Text>
            </Text>
          </Pressable>
          {editingMade === m.id && (
            <View style={{ gap: 8, paddingBottom: 6 }} testID="made-editor">
              <Text style={{ color: c.muted, fontSize: 13 }}>{t("food:dish.whoMade")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {members.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.name || p.email.split("@")[0]}
                    selected={p.id === m.userId}
                    onPress={async () => (await run(dishApi.updateMade(d.id, m.id, { userId: p.id }))) && setEditingMade(null)}
                  />
                ))}
                <Chip
                  label={t("food:dish.deleteMade")}
                  onPress={async () => {
                    if (await confirm(t("food:visit.confirmDelete"), t("common.delete"), t("common.cancel"))) await run(dishApi.deleteMade(d.id, m.id));
                  }}
                />
              </View>
            </View>
          )}
        </View>
      ))}
      <View style={{ flexDirection: "row" }}>
        <Chip label={t("food:dish.madeToday")} onPress={() => run(dishApi.made(d.id), t("food:dish.madeAdded"))} />
      </View>

      <Reviews
        ratings={d.ratings}
        me={me}
        onSave={async (stars, review) => show(await dishApi.rate(d.id, stars, review))}
        onRemove={async () => show(await dishApi.unrate(d.id))}
      />
      {notice ? <Body muted>{notice}</Body> : null}
      <ErrorText>{error}</ErrorText>

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
    </FormScroll>
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
