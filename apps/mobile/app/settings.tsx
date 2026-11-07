import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Body, Button, ErrorText, Title, useColors } from "@/components/ui";
import { api } from "@/core/api";
import { errorText } from "@/core/errors";
import { applyLanguage, savedLanguage, type Language } from "@/core/i18n";
import { useSession } from "@/core/session";
import { notificationsSupported, pushSupported, setPush, setReminders, settings } from "@/core/notifications";
import { FormScroll } from "@/components/FormScroll";

const NAMES: Record<Language, string> = { en: "English", ko: "한국어" };

export default function Settings() {
  const { t } = useTranslation();
  const { state, signOut } = useSession();
  const c = useColors();
  const [choice, setChoice] = useState<Language | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [reminders, setRemindersOn] = useState(false);
  const [push, setPushOn] = useState(false);

  useEffect(() => {
    savedLanguage().then(setChoice);
    settings.reminders().then(setRemindersOn);
    settings.push().then(setPushOn);
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
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 14 }}>
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
      {notificationsSupported && (
        <>
          <Title>{t("settings.notifications")}</Title>
          <Button
            kind={reminders ? "primary" : "plain"}
            label={`${reminders ? "🔔" : "🔕"} ${t("settings.notifyReminders")}`}
            onPress={() => {
              setRemindersOn(!reminders);
              setReminders(!reminders).catch((e) => setError(errorText(t, e)));
            }}
          />
          <Body muted>{t("settings.notifyRemindersHint")}</Body>
          {pushSupported && (
            <>
              <Button
                kind={push ? "primary" : "plain"}
                label={`${push ? "🔔" : "🔕"} ${t("settings.notifyPush")}`}
                onPress={() =>
                  setPush(!push).then(
                    (on) => {
                      setPushOn(on);
                      if (!push && !on) setError(t("settings.notifyDenied"));
                    },
                    (e) => setError(errorText(t, e)),
                  )
                }
              />
              <Body muted>{t("settings.notifyPushHint")}</Body>
            </>
          )}
        </>
      )}
      {state.status === "signedIn" && <Body muted>{t("settings.signedInAs", { email: state.user.email })}</Body>}
      <Button kind="plain" label={t("common.signOut")} onPress={signOut} />
    </FormScroll>
  );
}
