import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, View } from "react-native";
import { Body, Button, Card, ErrorText, Field, useColors, Text } from "@/components/ui";
import { apiImage } from "@/core/api";
import { errorText } from "@/core/errors";
import { RatingBadge } from "../restaurants/Stars";
import { dishApi, type DishSummary } from "./api";

/** Dishes made at home: search, quick add by name, average stars and when it was last made. */
export function DishList({ groupId, dishes }: { groupId: string; dishes: DishSummary[] }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const s = q.trim().toLowerCase();
  const shown = dishes.filter((d) => !s || d.name.toLowerCase().includes(s));

  const add = async () => {
    setBusy(true);
    setError("");
    try {
      const d = await dishApi.create(groupId, { name });
      setName("");
      router.push({ pathname: "/dish/[id]", params: { id: d.id } });
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}>
          <Field value={name} onChangeText={setName} placeholder={t("food:dish.namePlaceholder")} onSubmitEditing={name.trim() ? add : undefined} />
        </View>
        <Button label={t("food:dish.add")} busy={busy} disabled={!name.trim()} onPress={add} />
      </View>
      <ErrorText>{error}</ErrorText>
      {dishes.length > 4 && <Field value={q} onChangeText={setQ} placeholder={t("food:dish.search")} />}
      {dishes.length === 0 && <Body muted>{t("food:dish.empty")}</Body>}
      {shown.map((d) => (
        <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={d.name} onPress={() => router.push({ pathname: "/dish/[id]", params: { id: d.id } })}>
          <Card testID="dish-card">
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              {d.coverPhotoId && <Image source={apiImage(`/api/photos/${d.coverPhotoId}?size=thumb`)} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="cover" />}
              <Text style={{ color: c.text, fontSize: 17, fontWeight: "600", flex: 1 }} numberOfLines={1}>
                {d.name}
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <RatingBadge rating={d.rating} />
              {d.category ? <Body muted>{t(`food:category.${d.category}`)}</Body> : null}
              {d.lastMadeAt && (
                <Text style={{ color: c.muted, fontSize: 13 }}>
                  {t("food:dish.lastMade", {
                    date: new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(new Date(d.lastMadeAt)),
                    count: d.madeCount,
                  })}
                </Text>
              )}
            </View>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}
