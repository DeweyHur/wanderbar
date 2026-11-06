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
import { SessionProvider, useSession } from "@/core/session";
import { handleTaps, refreshNotifications, startReminderSync, syncReminders } from "@/core/notifications";
import { AppState } from "react-native";
import { Jua_400Regular } from "@expo-google-fonts/jua";
import { GowunDodum_400Regular } from "@expo-google-fonts/gowun-dodum";
import { useFonts } from "expo-font";
import { fonts, palette } from "@/components/ui";

/** A share from another app (Android intent / iOS extension) opens the share screen. */
function ShareRedirect() {
  const { share } = useIncomingShare();
  const path = usePathname();
  useEffect(() => {
    if (share && path !== "/share") router.push("/share");
  }, [share, path]);
  return null;
}

/** Signed in: keep reminders scheduled (on start, on return to the app, after changes) and open tapped notifications. */
function Notifications() {
  const { state } = useSession();
  const signedIn = state.status === "signedIn";
  useEffect(() => {
    if (!signedIn) return;
    refreshNotifications();
    const stopSync = startReminderSync();
    const stopTaps = handleTaps();
    const sub = AppState.addEventListener("change", (s) => s === "active" && syncReminders(false).catch(() => {}));
    return () => {
      stopSync();
      stopTaps();
      sub.remove();
    };
  }, [signedIn]);
  return null;
}

export default function RootLayout() {
  const { t } = useTranslation();
  // The round fonts are bundled with the app; wait for them so nothing flashes in a system font.
  const [fontsReady, fontError] = useFonts({ Jua_400Regular, GowunDodum_400Regular });
  if (!fontsReady && !fontError) return null;
  return (
    <IncomingShareProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <ShareRedirect />
        <Notifications />
        <Stack
          screenOptions={{
            headerBackButtonDisplayMode: "minimal",
            headerShadowVisible: false,
            headerStyle: { backgroundColor: palette.bg },
            headerTintColor: palette.accent,
            headerTitleStyle: { fontFamily: fonts.heading, color: palette.text, fontSize: 20 },
            contentStyle: { backgroundColor: palette.bg },
          }}
        >
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
            name="dish/[id]"
            options={{ title: t("food:dish.title") }}
          />
          <Stack.Screen
            name="menu/[id]"
            options={{ title: t("food:menu.title") }}
          />
          <Stack.Screen
            name="group/new"
            options={{ title: t("group.newTitle") }}
          />
          <Stack.Screen
            name="night/[id]"
            options={{ title: t("boardgame:night.title") }}
          />
          <Stack.Screen
            name="game/new"
            options={{ title: t("boardgame:game.add") }}
          />
          <Stack.Screen
            name="game/[id]"
            options={{ title: t("boardgame:game.title") }}
          />
          <Stack.Screen
            name="meetup/schedule"
            options={{ title: t("boardgame:schedule.title") }}
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
