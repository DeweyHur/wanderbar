import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Body, Button, Card, Chip, Field, Text, useColors } from "@/components/ui";
import { bggApi, bggAvailable, bggLink, LINK_KINDS, type BggGame, type BggHit, type BggInfo, type GameInput, type GameLink, type LinkKind } from "./api";
import { nameFromLink, splitTags } from "./format";
import { bggFacts, GameThumb, PoweredByBgg } from "./parts";

type Initial = { name: string; memo: string; links: GameLink[]; tags: string[]; bgg?: BggInfo | null };

/** Name, one link of each kind (BGG, BGA, TTS, rulebook, video, other), tags and notes. */
export function GameForm({ initial, knownTags, busy, onSave }: { initial?: Initial; knownTags: string[]; busy?: boolean; onSave: (g: GameInput) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  /** The name last filled in from a link (typing "…/266192/w", "…/wi", … keeps it in step). */
  const [autoName, setAutoName] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<LinkKind, string>>(
    () => Object.fromEntries(LINK_KINDS.map((k) => [k, initial?.links.find((l) => l.kind === k)?.url ?? ""])) as Record<LinkKind, string>,
  );
  const [otherLabel, setOtherLabel] = useState(initial?.links.find((l) => l.kind === "other")?.label ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const c = useColors();
  // BoardGameGeek autocomplete on the name (when the server has a BGG token).
  const [bggOn, setBggOn] = useState(false);
  const [hits, setHits] = useState<BggHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<BggGame | BggInfo | null>(initial?.bgg ?? null);
  const [typedName, setTypedName] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    bggAvailable().then(setBggOn);
  }, []);
  useEffect(() => {
    const q = name.trim();
    if (!bggOn || !typedName || q.length < 2) {
      setHits([]);
      return;
    }
    const n = ++seq.current;
    const timer = setTimeout(() => {
      setSearching(true);
      bggApi
        .search(q)
        .then((r) => n === seq.current && setHits(r))
        .catch(() => n === seq.current && setHits([]))
        .finally(() => n === seq.current && setSearching(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [name, typedName, bggOn]);

  // A BGG link pasted or typed in: look the game up once it stops changing (not on every keystroke).
  const [linkTyped, setLinkTyped] = useState<string | null>(null);
  useEffect(() => {
    if (linkTyped === null) return;
    const id = Number(/boardgamegeek\.com\/boardgame(?:expansion)?\/(\d+)/i.exec(linkTyped)?.[1]);
    if (!id) {
      setPicked(null);
      return;
    }
    if (!bggOn || picked?.id === id) return;
    const timer = setTimeout(() => {
      bggApi.game(id).then((g) => {
        setPicked(g);
        if (!typedName) {
          setName(g.name);
          setAutoName(g.name);
        }
      }, () => {});
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkTyped, bggOn]);

  /** Picking a BGG result fills the name and BGG link and shows the box art; the server stores the details on save. */
  const pick = (h: BggHit) => {
    setTypedName(false);
    setHits([]);
    setName(h.name);
    setAutoName(h.name);
    setLinks((l) => ({ ...l, bgg: bggLink(h.id) }));
    bggApi.game(h.id).then(setPicked, () => setPicked(null));
  };

  const setLink = (kind: LinkKind, url: string) => {
    setLinks((l) => ({ ...l, [kind]: url }));
    if (kind === "bgg") setLinkTyped(url);
    // A BGG / BGA link names the game, unless the name was typed in by hand.
    if (kind === "bgg" || kind === "bga") {
      const guess = nameFromLink(url);
      if (guess && (!name.trim() || name === autoName)) {
        setName(guess);
        setAutoName(guess);
      }
    }
  };
  const current = splitTags(tags);
  const addTag = (tag: string) => {
    if (!current.some((x) => x.toLowerCase() === tag.toLowerCase())) setTags([...current, tag].join(", "));
  };

  const save = () =>
    onSave({
      name,
      memo,
      tags: current,
      links: LINK_KINDS.filter((k) => links[k].trim()).map((k) => ({ kind: k, url: links[k].trim(), label: k === "other" ? otherLabel.trim() || null : null })),
    });

  return (
    <View style={{ gap: 12 }}>
      <Field
        label={t("boardgame:game.name")}
        value={name}
        onChangeText={(s) => {
          setName(s);
          setTypedName(true);
        }}
        placeholder={bggOn ? t("boardgame:bgg.searchPlaceholder") : t("boardgame:game.namePlaceholder")}
      />
      {(searching || hits.length > 0) && (
        <Card testID="bgg-results">
          {searching && !hits.length ? <ActivityIndicator /> : null}
          {hits.map((h) => (
            <Pressable
              key={h.id}
              accessibilityRole="button"
              accessibilityLabel={h.year ? `${h.name} (${h.year})` : h.name}
              onPress={() => pick(h)}
              style={({ pressed }) => ({ paddingVertical: 8, opacity: pressed ? 0.5 : 1 })}
            >
              <Text style={{ color: c.text, fontSize: 16 }}>
                {h.name}
                {h.year ? <Text style={{ color: c.muted }}> ({h.year})</Text> : null}
              </Text>
            </Pressable>
          ))}
          <PoweredByBgg />
        </Card>
      )}
      {picked && (
        <View testID="bgg-picked" style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <GameThumb bgg={picked} size={72} />
          <View style={{ flex: 1, gap: 2 }}>
            {picked.year ? <Body muted>{String(picked.year)}</Body> : null}
            <Body muted>{bggFacts(picked, t)}</Body>
            <PoweredByBgg id={picked.id} />
          </View>
        </View>
      )}
      <Field label={t("boardgame:game.linkField.bgg")} value={links.bgg} onChangeText={(s) => setLink("bgg", s)} placeholder="https://boardgamegeek.com/boardgame/…" />
      {(["bga", "tts", "rulebook", "video", "other"] as const).map((k) => (
        <Field key={k} label={t(`boardgame:game.linkField.${k}`)} value={links[k]} onChangeText={(s) => setLink(k, s)} placeholder="https://" />
      ))}
      {links.other.trim() ? (
        <Field label={t("boardgame:game.otherLabel")} value={otherLabel} onChangeText={setOtherLabel} placeholder={t("boardgame:game.otherLabelPlaceholder")} />
      ) : null}
      <Field
        label={t("boardgame:game.tags")}
        value={tags}
        onChangeText={setTags}
        placeholder={t("boardgame:game.tagsPlaceholder")}
        hint={knownTags.length ? t("boardgame:game.tagsHint") : undefined}
      />
      {knownTags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {knownTags.map((tag) => (
            <Chip key={tag} label={`#${tag}`} selected={current.some((x) => x.toLowerCase() === tag.toLowerCase())} onPress={() => addTag(tag)} />
          ))}
        </View>
      )}
      <Field label={t("boardgame:game.memo")} value={memo} onChangeText={setMemo} placeholder={t("boardgame:game.memoPlaceholder")} multiline />
      <Button label={t("boardgame:game.save")} busy={busy} disabled={!name.trim()} onPress={save} />
    </View>
  );
}
