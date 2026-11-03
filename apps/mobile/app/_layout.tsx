// Crash reporting first, so errors while the rest of the app loads are reported too.
import "@/core/crashReporter";
import "@/core/i18n";
import { Stack, router, usePathname } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import {
  IncomingShareProvider,
  useIncomingShare,
} from "@/core/platform/shareIntent";
import { SessionProvider } from "@/core/session";

/** A share from another app (Android intent / iOS extension) opens the share screen. */
function ShareRedirect() {
  const { share } = useIncomingShare();
  const path = usePathname();
  useEffect(() => {
    if (share && path !== "/share") router.push("/share");
  }, [share, path]);
  return null;
}

export default function RootLayout() {
  const { t } = useTranslation();
  return (
    <IncomingShareProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <ShareRedirect />
        <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
          <Stack.Screen
            name="index"
            options={{ headerShown: false, title: t("appName") }}
          />
          <Stack.Screen
            name="group/[id]/index"
            options={{ title: t("group.title") }}
          />
          <Stack.Screen
            name="group/[id]/members"
            options={{ title: t("food:route.members") }}
          />
          <Stack.Screen
            name="plan/[id]/index"
            options={{ title: t("food:route.title") }}
          />
          <Stack.Screen
            name="plan/[id]/map"
            options={{ title: t("food:route.map") }}
          />
          <Stack.Screen
            name="plan/[id]/stop/[stopId]"
            options={{ title: t("food:stop.edit") }}
          />
          <Stack.Screen
            name="restaurant/new"
            options={{ title: t("food:restaurant.add") }}
          />
          <Stack.Screen
            name="restaurant/[id]"
            options={{ title: t("food:restaurant.title") }}
          />
          <Stack.Screen
            name="menu/[id]"
            options={{ title: t("food:menu.title") }}
          />
          <Stack.Screen
            name="invite/[token]"
            options={{ title: t("invite.title") }}
          />
          <Stack.Screen
            name="settings"
            options={{ title: t("settings.title") }}
          />
          <Stack.Screen
            name="share"
            options={{ title: t("food:share.title") }}
          />
        </Stack>
      </SessionProvider>
    </IncomingShareProvider>
  );
}
