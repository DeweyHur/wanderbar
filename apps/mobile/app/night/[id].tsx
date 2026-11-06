import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { useSession } from "@/core/session";
import { bgApi, type GameSummary, type Night, type NightGame, type QueueEntry } from "@/modules/boardgame/api";
import { localParts, nightWhen } from "@/modules/boardgame/format";
import { GameLinks, ScoreBadge, ScoreInput, SectionTitle } from "@/modules/boardgame/parts";

/** One game night: who picks, the games (with their links), rating them afterwards, notes. */
export default function NightScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.id : null;
  const [n, setN] = useState<Night | null>(null);
  const [library, setLibrary] = useState<GameSummary[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const show = (x: Night) => {
    setN(x);
    setNote(x.note);
  };
  const load = useCallback(() => {
    bgApi
      .night(id)
      .then((x) => {
        show(x);
        bgApi.games(x.groupId).then(setLibrary, () => {});
        bgApi.home(x.groupId).then((h) => setQueue(h.queue), () => {});
      })
      .catch((e) => setError(errorText(t, e)));
  }, [id, t]);
  useFocusEffect(load);

  if (!n)
    return error ? (
      <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}>
        <ErrorText>{error}</ErrorText>
      </View>
    ) : (
      <Loading />
    );

  const run = async (p: Promise<Night>, done = "") => {
    setError("");
    setNotice("");
    try {
      show(await p);
      setNotice(done);
      return true;
    } catch (e) {
      setError(errorText(t, e));
      return false;
    }
  };
  const addGame = (gameId: string) =>
    run(bgApi.addGame(n.id, gameId)).then((ok) => {
      if (ok) {
        setSearch("");
        setQueue((q) => q.filter((x) => x.id !== gameId));
      }
    });

  const inLineup = new Set(n.games.map((g) => g.id));
  const s = search.trim().toLowerCase();
  const matches = s ? library.filter((g) => !inLineup.has(g.id) && g.name.toLowerCase().includes(s)).slice(0, 8) : [];
  // The queue is for picking what to play next, not for recording a night that already happened.
  const queued = n.status === "past" ? [] : queue.filter((q) => !inLineup.has(q.id));
  const canNote = n.canManage || n.picker?.id === me;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t("boardgame:night.title") }} />
      <Card testID="night-info">
        <Text style={{ color: n.status === "past" ? c.muted : c.accent, fontSize: 13, fontWeight: "700" }}>{t(`boardgame:night.status.${n.status}`)}</Text>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{nightWhen(n.startsAt, n.timezone, i18n.language)}</Text>
        {n.seriesTitle || n.location ? <Body muted>{[n.seriesTitle, n.location].filter(Boolean).join(" · ")}</Body> : null}
      </Card>

      {n.status !== "past" && <SectionTitle>{t("boardgame:night.picker")}</SectionTitle>}
      {n.status !== "past" && <Body>{n.picker ? t("boardgame:night.pickedBy", { name: n.picker.name }) : t("boardgame:night.nobodyPicking")}</Body>}
      {n.canAssignPicker && n.status !== "past" && (
        <View style={{ gap: 8 }}>
          {n.picker?.id !== me && me && (
            <View style={{ flexDirection: "row" }}>
              <Chip label={t("boardgame:night.volunteer")} onPress={() => run(bgApi.updateNight(n.id, { pickerId: me }))} />
            </View>
          )}
          {n.picker && n.members.length > 1 && (
            <>
              <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600" }}>{t("boardgame:night.handTo")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {n.members
                  .filter((m) => m.id !== n.picker?.id)
                  .map((m) => (
                    <Chip key={m.id} label={m.name} onPress={() => run(bgApi.updateNight(n.id, { pickerId: m.id }))} />
                  ))}
              </View>
            </>
          )}
        </View>
      )}

      <SectionTitle>{t("boardgame:night.games")}</SectionTitle>
      {n.games.length === 0 && <Body muted>{t("boardgame:night.noGames")}</Body>}
      {n.games.map((g) => (
        <Card key={g.id} testID="lineup-card">
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text
              accessibilityRole="link"
              onPress={() => router.push({ pathname: "/game/[id]", params: { id: g.id } })}
              style={{ color: c.text, fontSize: 17, fontWeight: "600", flexShrink: 1 }}
            >
              {g.name}
            </Text>
            <ScoreBadge rating={g.rating} />
          </View>
          <GameLinks links={g.links} />
          {n.status !== "upcoming" && <RateGame game={g} onSaved={load} />}
          {n.canEditLineup && n.status !== "past" && (
            <View style={{ flexDirection: "row" }}>
              <Chip label={t("boardgame:night.remove")} onPress={() => run(bgApi.removeGame(n.id, g.id))} />
            </View>
          )}
        </Card>
      ))}
      {n.status !== "upcoming" && n.games.length > 0 && <Body muted>{t("boardgame:night.rateHint")}</Body>}

      {n.canEditLineup ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }}>{t("boardgame:night.add")}</Text>
          {queued.length > 0 && (
            <>
              <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600" }}>{t("boardgame:night.addFromQueue")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {queued.map((q) => (
                  <Chip key={q.id} label={`${q.name} (${q.queuedBy.length})`} onPress={() => addGame(q.id)} />
                ))}
              </View>
            </>
          )}
          <Field label={t("boardgame:night.addFromLibrary")} value={search} onChangeText={setSearch} placeholder={t("boardgame:night.searchLibrary")} />
          {matches.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {matches.map((g) => (
                <Chip key={g.id} label={g.name} onPress={() => addGame(g.id)} />
              ))}
            </View>
          )}
          <Button kind="plain" label={t("boardgame:night.newGame")} onPress={() => router.push({ pathname: "/game/new", params: { groupId: n.groupId, nightId: n.id } })} />
        </View>
      ) : (
        n.picker && <Body muted>{t("boardgame:night.lineupLocked", { name: n.picker.name })}</Body>
      )}

      <SectionTitle>{t("boardgame:night.note")}</SectionTitle>
      {canNote ? (
        <>
          <Field value={note} onChangeText={setNote} placeholder={t("boardgame:night.notePlaceholder")} multiline />
          {note !== n.note && <Button kind="plain" label={t("boardgame:night.saveNote")} onPress={() => run(bgApi.updateNight(n.id, { note }))} />}
        </>
      ) : (
        <Body muted={!n.note}>{n.note || "–"}</Body>
      )}
      {notice ? <Body muted>{notice}</Body> : null}
      <ErrorText>{error}</ErrorText>

      {n.canManage && (
        <>
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <Chip label={t("boardgame:night.edit")} selected={editing} onPress={() => setEditing(!editing)} />
          </View>
          {editing && (
            <EditNight
              night={n}
              onSave={async (x) => (await run(bgApi.updateNight(n.id, x))) && setEditing(false)}
              onDelete={async () => {
                if (!(await confirm(t("boardgame:night.confirmDelete"), t("common.delete"), t("common.cancel")))) return;
                try {
                  await bgApi.deleteNight(n.id);
                  router.back();
                } catch (e) {
                  setError(errorText(t, e));
                }
              }}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

/** My score (1..10) and comment for a game played this night. */
function RateGame({ game, onSaved }: { game: NightGame; onSaved: () => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const [score, setScore] = useState(game.myScore ?? 0);
  const [review, setReview] = useState(game.myReview ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const dirty = score !== (game.myScore ?? 0) || review !== (game.myReview ?? "");
  return (
    <View style={{ gap: 8 }} testID="rate-game">
      <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>{t("boardgame:night.rateTitle")}</Text>
      <ScoreInput value={score} onChange={setScore} />
      <Field label={t("boardgame:rating.comment")} value={review} onChangeText={setReview} placeholder={t("boardgame:rating.commentPlaceholder")} multiline />
      {dirty && (
        <Button
          label={t("boardgame:rating.save")}
          busy={busy}
          disabled={score === 0}
          onPress={async () => {
            setBusy(true);
            setError("");
            try {
              await bgApi.rate(game.id, score, review);
              setMsg(t("boardgame:rating.saved"));
              onSaved();
            } catch (e) {
              setError(errorText(t, e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {msg && !dirty ? <Body muted>{msg}</Body> : null}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

function EditNight({ night, onSave, onDelete }: { night: Night; onSave: (x: { date: string; time: string; location: string }) => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const init = localParts(night.startsAt, night.timezone);
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [location, setLocation] = useState(night.location);
  return (
    <Card>
      <Field label={t("boardgame:schedule.date")} value={date} onChangeText={setDate} placeholder="2026-11-07" />
      <Field label={t("boardgame:schedule.timeField")} value={time} onChangeText={setTime} placeholder="19:00" hint={t("boardgame:schedule.timeHint", { tz: night.timezone })} />
      <Field label={t("boardgame:schedule.location")} value={location} onChangeText={setLocation} />
      <Button label={t("boardgame:night.save")} onPress={() => onSave({ date, time, location })} />
      <View style={{ flexDirection: "row" }}>
        <Chip label={t("boardgame:night.delete")} onPress={onDelete} />
      </View>
    </Card>
  );
}
