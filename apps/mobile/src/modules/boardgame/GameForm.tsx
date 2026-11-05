import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button, Chip, Field } from "@/components/ui";
import { LINK_KINDS, type GameInput, type GameLink, type LinkKind } from "./api";
import { nameFromLink, splitTags } from "./format";

type Initial = { name: string; memo: string; links: GameLink[]; tags: string[] };

/** Name, one link of each kind (BGG, BGA, TTS, rulebook, video, other), tags and notes. */
export function GameForm({ initial, knownTags, busy, onSave }: { initial?: Initial; knownTags: string[]; busy?: boolean; onSave: (g: GameInput) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [links, setLinks] = useState<Record<LinkKind, string>>(
    () => Object.fromEntries(LINK_KINDS.map((k) => [k, initial?.links.find((l) => l.kind === k)?.url ?? ""])) as Record<LinkKind, string>,
  );
  const [otherLabel, setOtherLabel] = useState(initial?.links.find((l) => l.kind === "other")?.label ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [memo, setMemo] = useState(initial?.memo ?? "");

  const setLink = (kind: LinkKind, url: string) => {
    setLinks((l) => ({ ...l, [kind]: url }));
    // A pasted BGG / BGA link names the game when the name is still empty.
    if ((kind === "bgg" || kind === "bga") && !name.trim()) {
      const guess = nameFromLink(url);
      if (guess) setName(guess);
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
      <Field label={t("boardgame:game.linkField.bgg")} value={links.bgg} onChangeText={(s) => setLink("bgg", s)} placeholder="https://boardgamegeek.com/boardgame/…" />
      <Field label={t("boardgame:game.name")} value={name} onChangeText={setName} placeholder={t("boardgame:game.namePlaceholder")} />
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
