import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import type { DishSummary } from "../dishes/api";
import { shoppingApi, type ShoppingItem } from "./api";
import { ShoppingRow } from "./ShoppingRow";

/** The group's shopping list: add (optionally for a dish), check off, clear what's bought. */
export function ShoppingList({ groupId, dishes }: { groupId: string; dishes: DishSummary[] }) {
  const { t } = useTranslation();
  const c = useColors();
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [name, setName] = useState("");
  const [dishId, setDishId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    shoppingApi.list(groupId).then(setItems, (e) => setError(errorText(t, e)));
  }, [groupId, t]);
  useEffect(load, [load]);

  const run = async (p: Promise<unknown>) => {
    setError("");
    try {
      await p;
      load();
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  const add = async () => {
    if (!name.trim()) return;
    const typed = name;
    setName("");
    await run(shoppingApi.add(groupId, { name: typed, dishId }));
  };
  const toggle = (i: ShoppingItem) => {
    // Check off right away; the server's answer follows.
    setItems((all) => all?.map((x) => (x.id === i.id ? { ...x, done: !i.done } : x)) ?? all);
    run(shoppingApi.update(i.id, { done: !i.done }));
  };

  const open = items?.filter((i) => !i.done) ?? [];
  const bought = items?.filter((i) => i.done) ?? [];
  const dish = dishes.find((d) => d.id === dishId);

  return (
    <View style={{ gap: 12 }} testID="shopping-list">
      <Field value={name} onChangeText={setName} placeholder={t("food:shopping.placeholder")} onSubmitEditing={add} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <Chip label={dish ? t("food:shopping.forDish", { name: dish.name }) : t("food:shopping.linkDish")} selected={!!dish || linking} onPress={() => (dish ? setDishId(null) : setLinking(!linking))} />
      </View>
      {linking && !dish && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} testID="dish-choices">
          {dishes.length === 0 && <Body muted>{t("food:shopping.noDishes")}</Body>}
          {dishes.map((d) => (
            <Chip
              key={d.id}
              label={d.name}
              onPress={() => {
                setDishId(d.id);
                setLinking(false);
              }}
            />
          ))}
        </View>
      )}
      <Button label={t("food:shopping.add")} disabled={!name.trim()} onPress={add} />
      <ErrorText>{error}</ErrorText>

      {items && items.length === 0 && <Body muted>{t("food:shopping.empty")}</Body>}
      {open.length > 0 && (
        <Card>
          {open.map((i) => (
            <ShoppingRow key={i.id} item={i} onToggle={() => toggle(i)} onRemove={() => run(shoppingApi.remove(i.id))} />
          ))}
        </Card>
      )}
      {bought.length > 0 && (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: c.muted, fontSize: 15, fontWeight: "700" }}>{t("food:shopping.bought", { count: bought.length })}</Text>
            <Chip label={t("food:shopping.clear")} onPress={() => run(shoppingApi.clearBought(groupId))} />
          </View>
          {bought.map((i) => (
            <ShoppingRow key={i.id} item={i} onToggle={() => toggle(i)} onRemove={() => run(shoppingApi.remove(i.id))} />
          ))}
        </View>
      )}
    </View>
  );
}
