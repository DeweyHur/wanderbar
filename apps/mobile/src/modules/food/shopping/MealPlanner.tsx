import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Body, Card, Chip, ErrorText, Field, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import { dishApi, type DishSummary } from "../dishes/api";
import { mealApi, shoppingApi, SLOTS, type Meal, type Slot } from "./api";
import { ShoppingRow } from "./ShoppingRow";

/**
 * A day at home: what's for lunch and dinner (a home-cooking dish, or anything typed) and, under each,
 * what to buy for it. Those items are also on the group's shopping list.
 */
export function MealPlanner({ planId, groupId }: { planId: string; groupId: string }) {
  const { t } = useTranslation();
  const c = useColors();
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [dishes, setDishes] = useState<DishSummary[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    mealApi.list(planId).then(setMeals, (e) => setError(errorText(t, e)));
  }, [planId, t]);
  useEffect(() => {
    load();
    dishApi.list(groupId).then(setDishes, () => {});
  }, [load, groupId]);

  const run = async (p: Promise<unknown>) => {
    setError("");
    try {
      await p;
      load();
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  if (!meals) return null;
  return (
    <View style={{ gap: 12 }} testID="meal-planner">
      {SLOTS.map((slot) => (
        <SlotCard key={slot} slot={slot} meals={meals.filter((m) => m.slot === slot)} dishes={dishes} groupId={groupId} planId={planId} run={run} />
      ))}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

type Run = (p: Promise<unknown>) => Promise<void>;

function SlotCard({ slot, meals, dishes, groupId, planId, run }: { slot: Slot; meals: Meal[]; dishes: DishSummary[]; groupId: string; planId: string; run: Run }) {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <Card testID={`meal-${slot}`}>
      <Text style={{ color: c.accent, fontSize: 16, fontWeight: "700" }}>
        {slot === "lunch" ? "🍱 " : "🍲 "}
        {t(`food:meal.${slot}`)}
      </Text>
      {meals.length === 0 && <Body muted>{t("food:meal.none")}</Body>}
      {meals.map((m) => (
        <MealRow key={m.id} m={m} groupId={groupId} run={run} />
      ))}
      <AddMeal slot={slot} dishes={dishes} onAdd={(m) => run(mealApi.add(planId, { slot, ...m }))} />
    </Card>
  );
}

function MealRow({ m, groupId, run }: { m: Meal; groupId: string; run: Run }) {
  const { t } = useTranslation();
  const c = useColors();
  const [adding, setAdding] = useState(false);
  const [item, setItem] = useState("");
  const add = async () => {
    if (!item.trim()) return;
    const typed = item;
    setItem("");
    await run(shoppingApi.add(groupId, { name: typed, mealId: m.id }));
  };
  return (
    <View testID="meal-row" style={{ gap: 4, paddingVertical: 4, borderTopWidth: 1, borderColor: c.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable style={{ flex: 1 }} disabled={!m.dishId} onPress={() => m.dishId && router.push({ pathname: "/dish/[id]", params: { id: m.dishId } })}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: "600" }}>{m.name || t("food:meal.deletedDish")}</Text>
        </Pressable>
        <Chip label={t("food:meal.shop", { count: m.shopping.filter((s) => !s.done).length })} icon="🛒" selected={adding} onPress={() => setAdding(!adding)} />
        <Pressable accessibilityRole="button" accessibilityLabel={t("food:meal.remove", { name: m.name })} hitSlop={8} onPress={() => run(mealApi.remove(m.id))}>
          <Text style={{ color: c.muted, fontSize: 18, paddingHorizontal: 6 }}>×</Text>
        </Pressable>
      </View>
      {m.shopping.map((s) => (
        <ShoppingRow key={s.id} item={s} showFor={false} onToggle={() => run(shoppingApi.update(s.id, { done: !s.done }))} onRemove={() => run(shoppingApi.remove(s.id))} />
      ))}
      {adding && <Field value={item} onChangeText={setItem} placeholder={t("food:shopping.placeholder")} onSubmitEditing={add} />}
    </View>
  );
}

/** Type a dish (or anything) and press enter, or tap one of the group's dishes. */
function AddMeal({ slot, dishes, onAdd }: { slot: Slot; dishes: DishSummary[]; onAdd: (m: { dishId?: string; title?: string }) => Promise<void> }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const matches = (s ? dishes.filter((d) => d.name.toLowerCase().includes(s)) : [...dishes].sort((a, b) => (b.lastMadeAt ?? "").localeCompare(a.lastMadeAt ?? ""))).slice(0, 6);
  const submit = async () => {
    if (!q.trim()) return;
    const title = q;
    setQ("");
    await onAdd({ title });
  };
  return (
    <View style={{ gap: 8 }}>
      <Field value={q} onChangeText={setQ} placeholder={t(`food:meal.placeholder_${slot}`)} onSubmitEditing={submit} />
      {matches.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {matches.map((d) => (
            <Chip
              key={d.id}
              label={d.name}
              icon="🍳"
              onPress={() => {
                setQ("");
                onAdd({ dishId: d.id });
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
