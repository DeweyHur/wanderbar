import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { useSession } from "@/core/session";
import { bgApi, type Game } from "@/modules/boardgame/api";
import { GameForm } from "@/modules/boardgame/GameForm";
import { allTags, GameLinks, ScoreBadge, ScoreInput, SectionTitle } from "@/modules/boardgame/parts";

/** A game: its links (BGG, BGA, TTS, rulebook, video), tags, the queue, my 10-point rating and everyone's comments. */
export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.id : null;
  const [g, setG] = useState<Game | null>(null);
  const [score, setScore] = useState(0);
  const [review, setReview] = useState("");
  const [editing, setEditing] = useState(false);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const show = (x: Game) => {
    setG(x);
    setScore(x.mine?.score ?? 0);
    setReview(x.mine?.review ?? "");
  };
  useFocusEffect(
    useCallback(() => {
      bgApi
        .game(id)
        .then((x) => {
          show(x);
          bgApi.games(x.groupId).then((all) => setKnownTags(allTags(all)), () => {});
        })
        .catch((e) => setError(errorText(t, e)));
    }, [id, t]),
  );

  if (!g)
    return error ? (
      <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}>
        <ErrorText>{error}</ErrorText>
      </View>
    ) : (
      <Loading />
    );

  const run = async (p: Promise<Game>, done = "") => {
    setBusy(true);
    setError("");
    setNotice("");
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
  const others = g.ratings.filter((r) => r.userId !== me);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: g.name }} />
      <Card testID="game-info">
        <Text style={{ color: c.accent, fontSize: 13, fontWeight: "700" }}>{t("boardgame:game.title")}</Text>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{g.name}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {g.rating.count ? <ScoreBadge rating={g.rating} /> : <Body muted>{t("boardgame:rating.none")}</Body>}
          <Body muted>
            {t("boardgame:game.plays", { count: g.plays })}
            {g.lastPlayedAt ? ` · ${t("boardgame:game.lastPlayed", { date: fmt.format(new Date(g.lastPlayedAt)) })}` : ""}
          </Body>
        </View>
        {g.tags.length > 0 && <Text style={{ color: c.muted, fontSize: 14 }}>{g.tags.map((x) => `#${x}`).join("  ")}</Text>}
        {g.links.length ? <GameLinks links={g.links} /> : <Body muted>{t("boardgame:game.noLinks")}</Body>}
        {g.memo ? <Body>{g.memo}</Body> : null}
      </Card>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {g.queuedByMe ? (
          <Chip label={t("boardgame:queue.remove")} onPress={() => run(bgApi.unqueue(g.id))} />
        ) : (
          <Chip label={t("boardgame:queue.add")} onPress={() => run(bgApi.queue(g.id), t("boardgame:queue.added"))} />
        )}
        {g.queuedBy.length > 0 && <Body muted>{t("boardgame:queue.wantedBy", { names: g.queuedBy.map((q) => q.name).join(", ") })}</Body>}
      </View>

      <SectionTitle>{t("boardgame:rating.yours")}</SectionTitle>
      <ScoreInput value={score} onChange={setScore} />
      <Field label={t("boardgame:rating.comment")} value={review} onChangeText={setReview} placeholder={t("boardgame:rating.commentPlaceholder")} multiline />
      <Button label={t("boardgame:rating.save")} busy={busy} disabled={score === 0} onPress={() => run(bgApi.rate(g.id, score, review), t("boardgame:rating.saved"))} />
      {g.mine && (
        <View style={{ flexDirection: "row" }}>
          <Chip label={t("boardgame:rating.remove")} onPress={() => run(bgApi.unrate(g.id))} />
        </View>
      )}
      {notice ? <Body muted>{notice}</Body> : null}
      <ErrorText>{error}</ErrorText>

      {others.length > 0 && <SectionTitle>{t("boardgame:rating.group")}</SectionTitle>}
      {others.map((r) => (
        <Card key={r.userId} testID="game-review">
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: c.text, fontWeight: "600" }}>{r.name}</Text>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "700" }}>{r.score}/10</Text>
          </View>
          {r.review ? <Body>{r.review}</Body> : null}
        </Card>
      ))}

      {g.nights.length > 0 && <SectionTitle>{t("boardgame:game.nights")}</SectionTitle>}
      {g.nights.map((n) => (
        <Pressable key={n.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/night/[id]", params: { id: n.id } })}>
          <Text style={{ color: n.past ? c.text : c.accent, fontSize: 15, paddingVertical: 4 }}>{fmt.format(new Date(n.startsAt))}</Text>
        </Pressable>
      ))}

      <View style={{ flexDirection: "row", marginTop: 10 }}>
        <Chip label={t("boardgame:game.edit")} selected={editing} onPress={() => setEditing(!editing)} />
      </View>
      {editing && (
        <Card>
          <GameForm
            initial={g}
            knownTags={knownTags}
            busy={busy}
            onSave={async (input) => (await run(bgApi.updateGame(g.id, input), t("boardgame:game.saved"))) && setEditing(false)}
          />
          {g.canDelete && (
            <View style={{ flexDirection: "row" }}>
              <Chip
                label={t("boardgame:game.delete")}
                onPress={async () => {
                  if (!(await confirm(t("boardgame:game.confirmDelete", { name: g.name }), t("common.delete"), t("common.cancel")))) return;
                  try {
                    await bgApi.deleteGame(g.id);
                    router.back();
                  } catch (e) {
                    setError(errorText(t, e));
                  }
                }}
              />
            </View>
          )}
        </Card>
      )}
    </ScrollView>
  );
}
