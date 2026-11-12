import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FormScroll } from "@/components/FormScroll";
import { GroupBar } from "@/components/GroupSwitcher";
import { FontPicker, ThemePicker } from "@/components/ThemePicker";
import { Body, ErrorText, useColors } from "@/components/ui";
import { useSession } from "@/core/session";

/** The group's theme and font: everyone in the group sees them; the owner picks. */
export default function GroupLook() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const g = state.status === "signedIn" ? state.groups.find((x) => x.id === id) : undefined;
  const [error, setError] = useState("");
  const owner = g?.role === "owner";
  return (
    <FormScroll testID="group-look" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 18 }}>
      <Stack.Screen options={{ title: t("group.lookTitle") }} />
      <GroupBar groupId={id} />
      {!owner ? <Body muted>{t("group.ownerOnly")}</Body> : null}
      <ThemePicker groupId={id} current={g?.theme} onError={setError} readOnly={!owner} />
      <FontPicker groupId={id} current={g?.font} onError={setError} readOnly={!owner} />
      <ErrorText>{error}</ErrorText>
    </FormScroll>
  );
}
