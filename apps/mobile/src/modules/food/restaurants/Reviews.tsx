import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import { StarInput, Stars } from "./Stars";

export type Review = { userId: string; name: string; stars: number; review: string; updatedAt: string };

/**
 * Everyone's ratings as the same cards (mine first). Mine has an Edit button; rating or editing opens the
 * stars and review, and saving closes them again.
 */
export function Reviews({ ratings, me, onSave, onRemove }: { ratings: Review[]; me: string | null; onSave: (stars: number, review: string) => Promise<unknown>; onRemove: () => Promise<unknown> }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const mine = ratings.find((r) => r.userId === me) ?? null;
  const [editing, setEditing] = useState(false);
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });

  const open = () => {
    setStars(mine?.stars ?? 0);
    setReview(mine?.review ?? "");
    setError("");
    setEditing(true);
  };
  const run = async (p: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await p();
      setEditing(false);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  const shown = mine ? [mine, ...ratings.filter((r) => r !== mine)] : ratings;

  return (
    <View style={{ gap: 10 }} testID="reviews">
      <Text style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>{t("food:rating.group")}</Text>
      {editing ? (
        <Card testID="review-editor">
          <StarInput value={stars} onChange={setStars} />
          <Field label={t("food:rating.review")} value={review} onChangeText={setReview} placeholder={t("food:rating.reviewPlaceholder")} multiline />
          <Button label={t("food:rating.save")} busy={busy} disabled={stars === 0} onPress={() => run(() => onSave(stars, review))} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Chip label={t("common.cancel")} onPress={() => setEditing(false)} />
            {mine && <Chip label={t("food:rating.remove")} onPress={() => run(onRemove)} />}
          </View>
          <ErrorText>{error}</ErrorText>
        </Card>
      ) : (
        !mine && (
          <View style={{ flexDirection: "row" }}>
            <Chip label={t("food:rating.rateNow")} icon="⭐" onPress={open} />
          </View>
        )
      )}
      {shown.length === 0 && !editing && <Body muted>{t("food:rating.none")}</Body>}
      {shown.map((r) =>
        editing && r === mine ? null : (
          <Card key={r.userId} testID="review">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ color: c.text, fontWeight: "600", flex: 1 }}>{r.name}</Text>
              <Stars value={r.stars} />
              {r === mine && (
                <Pressable accessibilityRole="button" accessibilityLabel={t("food:rating.edit")} hitSlop={8} onPress={open}>
                  <Text style={{ color: c.accent, fontSize: 14, fontWeight: "700", paddingLeft: 6 }}>{t("food:rating.edit")}</Text>
                </Pressable>
              )}
            </View>
            {r.review ? <Body>{r.review}</Body> : null}
            <Text style={{ color: c.muted, fontSize: 12 }}>{fmt.format(new Date(r.updatedAt))}</Text>
          </Card>
        ),
      )}
    </View>
  );
}
