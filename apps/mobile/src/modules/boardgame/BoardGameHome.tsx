import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, useColors, Text } from "@/components/ui";
import { errorText } from "@/core/errors";
import { prefs } from "@/core/platform/prefs";
import { useSession } from "@/core/session";
import { bgApi, type GameSummary, type Home } from "./api";
import { scoreText, timeLabel } from "./format";
import { allTags, bggFacts, GameLinks, GameThumb, NightCard, ScoreBadge, SectionTitle, TagChips } from "./parts";

type Tab = "next" | "games" | "leaderboard" | "history";
const TABS: Tab[] = ["next", "games", "leaderboard", "history"];
const TAB_KEY = "boardgame_home_tab";

/** A board game group's home: the next night and the queue, the games, the leaderboard, past nights. */
export function BoardGameHome({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const [home, setHome] = useState<Home | null>(null);
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [tab, setTab] = useState<Tab>("next");
  const [error, setError] = useState("");

  useEffect(() => {
    prefs.get(TAB_KEY).then((v) => TABS.includes(v as Tab) && setTab(v as Tab));
  }, []);
  const pickTab = (next: Tab) => {
    setTab(next);
    prefs.set(TAB_KEY, next);
  };

  const load = useCallback(() => {
    Promise.all([bgApi.home(groupId), bgApi.games(groupId)])
      .then(([h, g]) => {
        setHome(h);
        setGames(g);
        setError("");
      })
      .catch((e) => setError(errorText(t, e)));
  }, [groupId, t]);
  useFocusEffect(load);

  if (!home || !games) return error ? <ErrorText>{error}</ErrorText> : <Loading />;

  return (
    <View style={{ gap: 14 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {TABS.map((k) => (
          <Chip key={k} label={t(`boardgame:tab.${k}`)} selected={tab === k} onPress={() => pickTab(k)} />
        ))}
      </View>
      {tab === "next" ? (
        <NextTab groupId={groupId} home={home} onChange={load} onError={setError} />
      ) : tab === "games" ? (
        <GamesTab groupId={groupId} games={games} />
      ) : tab === "leaderboard" ? (
        <Leaderboard games={games} />
      ) : (
        <History home={home} />
      )}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

function NextTab({ groupId, home, onChange, onError }: { groupId: string; home: Home; onChange: () => void; onError: (s: string) => void }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.id : null;
  const next = home.upcoming[0];
  const canAdd = !!next && (home.canManage || !next.picker || next.picker.id === me);

  return (
    <View style={{ gap: 12 }}>
      {home.upcoming.length === 0 && <Body muted>{home.series.length ? t("boardgame:night.none") : t("boardgame:schedule.none")}</Body>}
      {home.upcoming.map((n, i) => (
        <NightCard key={n.id} night={n} tz={home.timezone} highlight={i === 0} />
      ))}
      {home.series.map((s) => (
        <Text key={s.id} style={{ color: c.muted, fontSize: 14 }}>
          {t("boardgame:schedule.summary", {
            every: t("boardgame:every", { count: s.everyWeeks }),
            weekday: t(`boardgame:weekday.${s.weekday}`),
            time: timeLabel(s.time, i18n.language),
          })}
          {s.location ? ` · ${s.location}` : ""}
        </Text>
      ))}
      {home.canManage && (
        <Button
          kind={home.series.length ? "plain" : "primary"}
          label={home.series.length ? t("boardgame:schedule.open") : t("boardgame:night.setUp")}
          onPress={() => router.push({ pathname: "/meetup/schedule", params: { groupId } })}
        />
      )}

      <SectionTitle>{t("boardgame:queue.title")}</SectionTitle>
      <Body muted>{home.queue.length ? t("boardgame:queue.hint") : t("boardgame:queue.empty")}</Body>
      {next && !canAdd && home.queue.length > 0 && next.picker && <Body muted>{t("boardgame:night.lineupLocked", { name: next.picker.name })}</Body>}
      {home.queue.map((q) => (
        <Card key={q.id} testID="queue-card">
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/game/[id]", params: { id: q.id } })}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <GameThumb bgg={q.bgg} size={44} />
              <Text style={{ color: c.text, fontSize: 17, fontWeight: "600", flex: 1 }}>{q.name}</Text>
              <ScoreBadge rating={q.rating} />
            </View>
          </Pressable>
          <Text style={{ color: c.muted, fontSize: 14 }}>{t("boardgame:queue.wantedBy", { names: q.queuedBy.map((x) => x.name).join(", ") })}</Text>
          <GameLinks links={q.links} />
          {canAdd && (
            <View style={{ flexDirection: "row" }}>
              <Chip
                label={t("boardgame:queue.addToNight")}
                onPress={() =>
                  bgApi
                    .addGame(next.id, q.id)
                    .then(onChange)
                    .catch((e) => onError(errorText(t, e)))
                }
              />
            </View>
          )}
        </Card>
      ))}
    </View>
  );
}

function GamesTab({ groupId, games }: { groupId: string; games: GameSummary[] }) {
  const { t } = useTranslation();
  const c = useColors();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => allTags(games), [games]);
  const active = tag && tags.includes(tag) ? tag : null;
  const shown = games.filter((g) => {
    const s = q.trim().toLowerCase();
    if (s && !g.name.toLowerCase().includes(s)) return false;
    return !active || g.tags.some((x) => x.toLowerCase() === active.toLowerCase());
  });
  return (
    <View style={{ gap: 12 }}>
      {games.length > 0 && <Field value={q} onChangeText={setQ} placeholder={t("boardgame:game.search")} />}
      <TagChips tags={tags} active={active} onPick={setTag} allLabel={t("boardgame:leaderboard.allTags")} />
      {games.length === 0 && <Body muted>{t("boardgame:game.empty")}</Body>}
      {shown.map((g) => (
        <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={g.name} onPress={() => router.push({ pathname: "/game/[id]", params: { id: g.id } })}>
          <Card testID="game-card">
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <GameThumb bgg={g.bgg} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ color: c.text, fontSize: 17, fontWeight: "600", flexShrink: 1 }}>{g.name}</Text>
                  <ScoreBadge rating={g.rating} />
                </View>
                {g.bgg ? <Text style={{ color: c.muted, fontSize: 13 }}>{bggFacts(g.bgg, t)}</Text> : null}
                <Text style={{ color: c.muted, fontSize: 14 }}>
                  {[t("boardgame:game.plays", { count: g.plays }), g.queuedBy.length ? t("boardgame:queue.added") : null, ...g.tags.map((x) => `#${x}`)].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
      <Button label={t("boardgame:game.add")} onPress={() => router.push({ pathname: "/game/new", params: { groupId } })} />
    </View>
  );
}

/** All-time ranking by average rating (or by plays), optionally only games with a tag. */
function Leaderboard({ games }: { games: GameSummary[] }) {
  const { t } = useTranslation();
  const c = useColors();
  const [by, setBy] = useState<"rating" | "plays">("rating");
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => allTags(games), [games]);
  const active = tag && tags.includes(tag) ? tag : null;
  const ranked = games
    .filter((g) => !active || g.tags.some((x) => x.toLowerCase() === active.toLowerCase()))
    .filter((g) => (by === "rating" ? g.rating.avg != null : g.plays > 0))
    .sort((a, b) =>
      by === "rating"
        ? b.rating.avg! - a.rating.avg! || b.rating.count - a.rating.count || b.plays - a.plays || a.name.localeCompare(b.name)
        : b.plays - a.plays || (b.rating.avg ?? 0) - (a.rating.avg ?? 0) || a.name.localeCompare(b.name),
    );
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Chip label={t("boardgame:leaderboard.byRating")} selected={by === "rating"} onPress={() => setBy("rating")} />
        <Chip label={t("boardgame:leaderboard.byPlays")} selected={by === "plays"} onPress={() => setBy("plays")} />
      </View>
      <TagChips tags={tags} active={active} onPick={setTag} allLabel={t("boardgame:leaderboard.allTags")} />
      {ranked.length === 0 && <Body muted>{active ? t("boardgame:leaderboard.emptyTag") : t("boardgame:leaderboard.empty")}</Body>}
      {ranked.map((g, i) => (
        <Pressable key={g.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/game/[id]", params: { id: g.id } })}>
          <View testID="rank-row" style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 12 }}>
            <Text style={{ color: i < 3 ? c.accent : c.muted, fontSize: 20, fontWeight: "800", width: 34, textAlign: "center" }}>{i + 1}</Text>
            <GameThumb bgg={g.bgg} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>
                {g.name}
              </Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>
                {[t("boardgame:rating.count", { count: g.rating.count }), t("boardgame:game.plays", { count: g.plays }), ...g.tags.map((x) => `#${x}`)].join(" · ")}
              </Text>
            </View>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>{by === "rating" ? scoreText(g.rating.avg) : `${g.plays}×`}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function History({ home }: { home: Home }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 12 }}>
      {home.past.length === 0 && <Body muted>{t("boardgame:history.empty")}</Body>}
      {home.past.map((n) => (
        <NightCard key={n.id} night={n} tz={home.timezone} />
      ))}
    </View>
  );
}
