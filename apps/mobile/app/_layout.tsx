import "@/core/i18n";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { SessionProvider } from "@/core/session";

export default function RootLayout() {
  const { t } = useTranslation();
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="index" options={{ headerShown: false, title: t("appName") }} />
        <Stack.Screen name="group/[id]/index" options={{ title: t("group.title") }} />
        <Stack.Screen name="group/[id]/members" options={{ title: t("food:route.members") }} />
        <Stack.Screen name="plan/[id]/index" options={{ title: t("food:route.title") }} />
        <Stack.Screen name="plan/[id]/stop/[stopId]" options={{ title: t("food:stop.edit") }} />
        <Stack.Screen name="invite/[token]" options={{ title: t("invite.title") }} />
        <Stack.Screen name="settings" options={{ title: t("settings.title") }} />
      </Stack>
    </SessionProvider>
  );
}
