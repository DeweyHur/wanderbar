import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Body, Button, ErrorText, Screen, Title } from "@/components/ui";
import { api } from "@/core/api";
import { errorText } from "@/core/errors";
import { applyLanguage, savedLanguage, type Language } from "@/core/i18n";
import { useSession } from "@/core/session";

const NAMES: Record<Language, string> = { en: "English", ko: "한국어" };

export default function Settings() {
  const { t } = useTranslation();
  const { state, signOut } = useSession();
  const [choice, setChoice] = useState<Language | null | undefined>(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    savedLanguage().then(setChoice);
  }, []);

  const pick = async (lang: Language | null) => {
    setChoice(lang);
    setError("");
    await applyLanguage(lang);
    // Also saved on the account so the choice follows the user to other devices and the web.
    await api("/api/me", { method: "PATCH", body: { locale: lang } }).catch((e) => setError(errorText(t, e)));
  };

  const options: (Language | null)[] = [null, "en", "ko"];
  return (
    <Screen>
      <Title>{t("settings.language")}</Title>
      {options.map((lang) => (
        <Button
          key={lang ?? "device"}
          kind={choice === lang ? "primary" : "plain"}
          label={lang ? NAMES[lang] : t("settings.languageSystem")}
          onPress={() => pick(lang)}
        />
      ))}
      <ErrorText>{error}</ErrorText>
      {state.status === "signedIn" && <Body muted>{t("settings.signedInAs", { email: state.user.email })}</Body>}
      <Button kind="plain" label={t("common.signOut")} onPress={signOut} />
    </Screen>
  );
}
