import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { isFontId, isThemeId, useTheme } from "@/components/ui";
import { useSession } from "@/core/session";

/** While a group's screen is in front, the app wears that group's theme and font. */
export function useGroupLook(groupId: string | null | undefined) {
  const { state } = useSession();
  const { setThemeId, setFontId } = useTheme();
  const g = groupId && state.status === "signedIn" ? state.groups.find((x) => x.id === groupId) : undefined;
  const theme = g?.theme;
  const font = g?.font;
  const known = !!g;
  useFocusEffect(
    useCallback(() => {
      if (!known) return;
      setThemeId(isThemeId(theme) ? theme : "pink");
      setFontId(isFontId(font) ? font : "round");
    }, [known, theme, font, setThemeId, setFontId]),
  );
}
