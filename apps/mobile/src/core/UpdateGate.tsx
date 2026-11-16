import { needsUpdate } from "@wanderbar/route";
import * as Application from "expo-application";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Linking, Platform, View } from "react-native";
import { Body, Button, Text, useColors } from "@/components/ui";
import { api } from "@/core/api";

type Config = { minAppVersion?: string; appStores?: { android?: string; ios?: string; iosWeb?: string } };

/**
 * Phone apps older than the server's minimum get a full-screen "update" page that opens Play or
 * TestFlight. Checked on start and whenever the app comes back to the front; the web is always current,
 * and with no signal the app is let through.
 */
export function UpdateGate() {
  const { t } = useTranslation();
  const c = useColors();
  const [cfg, setCfg] = useState<Config | null>(null);
  const mine = Application.nativeApplicationVersion;
  const check = useCallback(() => {
    api<Config>("/api/config").then(setCfg, () => {});
  }, []);
  useEffect(() => {
    if (Platform.OS === "web") return;
    check();
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => sub.remove();
  }, [check]);
  if (Platform.OS === "web" || !cfg || !needsUpdate(mine, cfg.minAppVersion)) return null;

  const open = async () => {
    const s = cfg.appStores ?? {};
    if (Platform.OS === "android") return Linking.openURL(s.android ?? "https://play.google.com/store/apps/details?id=app.wanderbar.mobile");
    // The TestFlight app first; its web page if TestFlight isn't installed.
    try {
      await Linking.openURL(s.ios ?? "itms-beta://");
    } catch {
      if (s.iosWeb) await Linking.openURL(s.iosWeb).catch(() => {});
    }
  };
  return (
    <View
      testID="update-gate"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.bg, padding: 28, gap: 16, justifyContent: "center", zIndex: 1000 }}
    >
      <Text style={{ fontSize: 56, textAlign: "center" }}>🎁</Text>
      <Text style={{ color: c.text, fontSize: 26, fontWeight: "700", textAlign: "center" }}>{t("update.title")}</Text>
      <Body>{t("update.body")}</Body>
      <Text style={{ color: c.muted, fontSize: 14, textAlign: "center" }}>{t("update.versions", { mine: mine ?? "?", min: cfg.minAppVersion })}</Text>
      <Button label={Platform.OS === "ios" ? t("update.openTestFlight") : t("update.openPlay")} onPress={open} />
      <Button kind="plain" label={t("update.checkAgain")} onPress={check} />
    </View>
  );
}
