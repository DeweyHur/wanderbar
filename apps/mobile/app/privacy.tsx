import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { FormScroll } from "@/components/FormScroll";
import { Body, useColors } from "@/components/ui";

/** The privacy policy (linked from Health Connect's permission screen and the store listings). Open to everyone. */
export default function PrivacyScreen() {
  const { t } = useTranslation();
  const c = useColors();
  const paragraphs = t("privacy.body", { returnObjects: true }) as string[];
  return (
    <FormScroll testID="privacy" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Stack.Screen options={{ title: t("privacy.title") }} />
      {paragraphs.map((p, i) => (
        <Body key={i}>{p}</Body>
      ))}
    </FormScroll>
  );
}
