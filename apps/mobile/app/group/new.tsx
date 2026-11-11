import { getLocales } from "expo-localization";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Body, Button, Chip, ErrorText, Field, useColors, Text } from "@/components/ui";
import { api, type GroupModuleId, type GroupSummary } from "@/core/api";
import { errorText } from "@/core/errors";
import { isLanguage, type Language } from "@/core/i18n";
import { useSession } from "@/core/session";
import { FormScroll } from "@/components/FormScroll";

const KIND_LABEL: Record<GroupModuleId, string> = { boardgame: "group.kindBoardgame", food: "group.kindFood", fitness: "group.kindFitness" };

/** Another group: food & day routes, or a board game night (often in English for an international group). */
export default function NewGroup() {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { refresh } = useSession();
  const [name, setName] = useState("");
  const [module, setModule] = useState<GroupModuleId>("boardgame");
  const [lang, setLang] = useState<Language>(isLanguage(i18n.language) ? i18n.language : "en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const g = await api<GroupSummary>("/api/groups", {
        body: {
          name: name.trim() || t(KIND_LABEL[module]),
          module,
          defaultLocale: lang,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          currency: getLocales()[0]?.currencyCode ?? "USD",
        },
      });
      await refresh();
      router.replace({ pathname: "/group/[id]", params: { id: g.id } });
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  const label = (s: string) => <Text style={{ color: c.muted, fontSize: 14, fontWeight: "600" }}>{s}</Text>;
  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t("group.newTitle") }} />
      {label(t("group.kind"))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Chip label={t("group.kindBoardgame")} selected={module === "boardgame"} onPress={() => setModule("boardgame")} />
        <Chip label={t("group.kindFood")} selected={module === "food"} onPress={() => setModule("food")} />
        <Chip label={t("group.kindFitness")} selected={module === "fitness"} onPress={() => setModule("fitness")} />
      </View>
      <Field label={t("group.name")} value={name} onChangeText={setName} placeholder={t(KIND_LABEL[module])} />
      {label(t("group.language"))}
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Chip label="English" selected={lang === "en"} onPress={() => setLang("en")} />
        <Chip label="한국어" selected={lang === "ko"} onPress={() => setLang("ko")} />
      </View>
      <Body muted>{t("group.language_hint")}</Body>
      <Button label={t("group.create")} busy={busy} onPress={create} />
      <ErrorText>{error}</ErrorText>
    </FormScroll>
  );
}
