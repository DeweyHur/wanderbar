import { GroupBar } from "@/components/GroupSwitcher";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ErrorText, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { bgApi, type GameInput } from "@/modules/boardgame/api";
import { GameForm } from "@/modules/boardgame/GameForm";
import { PlayDateField } from "@/modules/boardgame/PlayedOn";
import { allTags } from "@/modules/boardgame/parts";
import { FormScroll } from "@/components/FormScroll";

/** Add a game to the group's library (and straight onto a night's lineup when opened from one). */
export default function NewGame() {
  const { groupId, nightId } = useLocalSearchParams<{ groupId: string; nightId?: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [playedOn, setPlayedOn] = useState("");

  useEffect(() => {
    bgApi.games(groupId).then((g) => setTags(allTags(g)), () => {});
  }, [groupId]);

  const save = async (g: GameInput) => {
    setBusy(true);
    setError("");
    try {
      const game = await bgApi.createGame(groupId, g);
      if (!nightId && playedOn.trim()) {
        try {
          await bgApi.logPlay(game.id, playedOn.trim());
        } catch (e) {
          // The game is saved; open it so the date can be fixed there.
          router.replace({ pathname: "/game/[id]", params: { id: game.id } });
          setError(errorText(t, e));
          return;
        }
      }
      if (nightId) {
        await bgApi.addGame(nightId, game.id);
        router.back();
      } else {
        router.replace({ pathname: "/game/[id]", params: { id: game.id } });
      }
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t("boardgame:game.add") }} />
      <GroupBar groupId={groupId} />
      <GameForm
        knownTags={tags}
        busy={busy}
        onSave={save}
        extra={nightId ? null : <PlayDateField value={playedOn} onChange={setPlayedOn} label={t("boardgame:play.newGameField")} />}
      />
      <ErrorText>{error}</ErrorText>
    </FormScroll>
  );
}
