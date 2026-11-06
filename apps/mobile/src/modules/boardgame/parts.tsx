import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Image, Linking, Pressable, View } from "react-native";
import { Card, Chip, useColors, Text } from "@/components/ui";
import type { BggInfo, GameLink, NightSummary, Rating } from "./api";
import { nightWhen, scoreText } from "./format";

const GOLD = "#F5A524";

/** The game's box art from BGG (thumbnail unless `big`), or a die when there is none. */
export function GameThumb({ bgg, size = 56, big }: { bgg: BggInfo | null | undefined; size?: number; big?: boolean }) {
  const c = useColors();
  const uri = big ? (bgg?.image ?? bgg?.thumbnail) : (bgg?.thumbnail ?? bgg?.image);
  const box = { width: size, height: size, borderRadius: Math.round(size / 5), backgroundColor: c.bg };
  if (!uri)
    return (
      <View style={[box, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ fontSize: size / 2.2 }}>🎲</Text>
      </View>
    );
  return <Image testID="game-thumb" source={{ uri }} style={box} resizeMode={big ? "contain" : "cover"} accessibilityIgnoresInvertColors />;
}

/** "1–5 players · 70 min · weight 2.5" from BGG. */
export function bggFacts(bgg: BggInfo | null | undefined, t: (k: string, o?: Record<string, unknown>) => string) {
  if (!bgg) return "";
  const parts: string[] = [];
  if (bgg.minPlayers && bgg.maxPlayers)
    parts.push(t("boardgame:bgg.players", { players: bgg.minPlayers === bgg.maxPlayers ? `${bgg.minPlayers}` : `${bgg.minPlayers}–${bgg.maxPlayers}` }));
  if (bgg.playingTime) parts.push(t("boardgame:bgg.minutes", { count: bgg.playingTime }));
  if (bgg.weight) parts.push(t("boardgame:bgg.weight", { weight: bgg.weight.toFixed(1) }));
  return parts.join(" · ");
}

/** BGG's terms ask apps to credit it; this links back to the game on BGG. */
export function PoweredByBgg({ id }: { id?: number | null }) {
  const c = useColors();
  return (
    <Text
      accessibilityRole="link"
      onPress={() => Linking.openURL(id ? `https://boardgamegeek.com/boardgame/${id}` : "https://boardgamegeek.com")}
      style={{ color: c.muted, fontSize: 12 }}
    >
      Powered by BGG
    </Text>
  );
}

/** One chip per link (BGG, BGA, TTS, Rulebook, Video rules, …) that opens it. */
export function GameLinks({ links }: { links: GameLink[] }) {
  const { t } = useTranslation();
  if (!links.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {links.map((l) => (
        <Chip
          key={`${l.kind}:${l.url}`}
          label={l.kind === "other" && l.label ? l.label : t(`boardgame:game.link.${l.kind}`)}
          onPress={() => Linking.openURL(l.url)}
        />
      ))}
    </View>
  );
}

/** "★ 8.5/10 (2)" — nothing when nobody has rated yet. */
export function ScoreBadge({ rating, mine }: { rating: Rating; mine?: number | null }) {
  const c = useColors();
  const { t } = useTranslation();
  if (rating.avg == null) return null;
  return (
    <Text style={{ color: c.text, fontSize: 14 }}>
      <Text style={{ color: GOLD }}>★</Text> {scoreText(rating.avg)}
      <Text style={{ color: c.muted }}>/10 ({rating.count})</Text>
      {mine != null ? <Text style={{ color: c.muted }}> · {t("boardgame:rating.mine", { score: mine })}</Text> : null}
    </Text>
  );
}

/** Ten buttons, 1..10. */
export function ScoreInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", gap: 4, maxWidth: 440 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
        const on = value === n;
        return (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={t("boardgame:rating.score", { score: n })}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(n)}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 24,
              height: 40,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: on ? c.accent : c.border,
              backgroundColor: on ? c.accent : value >= n ? `${c.accent}33` : "transparent",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: on ? (c.dark ? c.onPink : "#fff") : c.text, fontSize: 15, fontWeight: "600" }}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const c = useColors();
  return <Text style={{ color: c.text, fontSize: 20, fontWeight: "700", marginTop: 6 }}>{children}</Text>;
}

/** A game night in a list: when, where, who picks, the games. */
export function NightCard({ night, tz, highlight }: { night: NightSummary; tz: string; highlight?: boolean }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nightWhen(night.startsAt, tz, i18n.language)}
      onPress={() => router.push({ pathname: "/night/[id]", params: { id: night.id } })}
    >
      <Card testID="night-card" highlight={highlight}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: c.text, fontSize: 17, fontWeight: "700", flexShrink: 1 }}>{nightWhen(night.startsAt, tz, i18n.language)}</Text>
          <Text style={{ color: night.status === "past" ? c.muted : c.accent, fontSize: 13, fontWeight: "700" }}>{t(`boardgame:night.status.${night.status}`)}</Text>
        </View>
        {night.seriesTitle || night.location ? (
          <Text style={{ color: c.muted, fontSize: 14 }}>{[night.seriesTitle, night.location].filter(Boolean).join(" · ")}</Text>
        ) : null}
        {night.status !== "past" && (
          <Text style={{ color: c.text, fontSize: 14 }}>{night.picker ? t("boardgame:night.pickedBy", { name: night.picker.name }) : t("boardgame:night.nobodyPicking")}</Text>
        )}
        {night.going + night.maybe > 0 && (
          <Text style={{ color: c.text, fontSize: 14 }}>
            👥 {night.maybe ? t("boardgame:rsvp.countMaybe", { going: night.going, maybe: night.maybe }) : t("boardgame:rsvp.count", { going: night.going })}
          </Text>
        )}
        {night.games.length ? (
          night.games.map((g) => (
            <View key={g.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <GameThumb bgg={g.bgg} size={36} />
                <Text style={{ color: c.text, fontSize: 16, fontWeight: "600", flex: 1 }}>{g.name}</Text>
                <ScoreBadge rating={g.rating} />
              </View>
            </View>
          ))
        ) : (
          <Text style={{ color: c.muted, fontSize: 14 }}>{t("boardgame:night.noGames")}</Text>
        )}
      </Card>
    </Pressable>
  );
}

export function TagChips({ tags, active, onPick, allLabel }: { tags: string[]; active: string | null; onPick: (t: string | null) => void; allLabel: string }) {
  if (!tags.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <Chip label={allLabel} selected={active === null} onPress={() => onPick(null)} />
      {tags.map((tag) => (
        <Chip key={tag} label={`#${tag}`} selected={active === tag} onPress={() => onPick(active === tag ? null : tag)} />
      ))}
    </View>
  );
}

/** Every tag used in the group, case-insensitively unique, alphabetical. */
export function allTags(games: { tags: string[] }[]) {
  const seen = new Map<string, string>();
  for (const g of games) for (const tag of g.tags) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
