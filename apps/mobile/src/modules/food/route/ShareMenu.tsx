import { teslaShareText, teslaShareTextWithFallback, type Destination } from "@wanderbar/route";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";
import { Button, useColors } from "@/components/ui";
import { copyText } from "@/core/platform/clipboard";
import { shareToKakao } from "@/core/platform/kakao";
import { shareText } from "@/core/platform/share";
import { canSendToTesla, sendToTesla } from "@/core/platform/tesla";
import { useTeslaFormat } from "./hooks";

/**
 * One Share button for a place: KakaoTalk, Tesla, or More (the system share sheet).
 * On the web (no Tesla or KakaoTalk hand-off) it copies the address instead.
 */
export function ShareMenu({ place, onNotice, kind = "primary" }: { place: Destination; onNotice?: (s: string) => void; kind?: "primary" | "plain" }) {
  const { t } = useTranslation();
  const c = useColors();
  const tesla = useTeslaFormat();
  const [open, setOpen] = useState(false);

  if (!canSendToTesla)
    return (
      <Button
        kind={kind}
        label={t("food:route.copyAddress")}
        onPress={() => copyText(place.address || place.name).then(() => onNotice?.(t("food:route.copied")))}
      />
    );

  const full = teslaShareText("full", place) ?? place.name;
  const pick = async (what: "kakao" | "tesla" | "more") => {
    setOpen(false);
    if (what === "kakao") {
      if ((await shareToKakao(full)) === "fallback") onNotice?.(t("food:share.kakaoNoApp"));
    } else if (what === "tesla") {
      if ((await sendToTesla(teslaShareTextWithFallback(tesla.format, place))) === "fallback") onNotice?.(t("food:route.teslaNoApp"));
    } else await shareText(full);
  };

  const Option = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ paddingVertical: 16, paddingHorizontal: 20, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: c.text, fontSize: 18 }}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <Button kind={kind} label={t("food:share.button")} onPress={() => setOpen(true)} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => setOpen(false)}>
          <Pressable style={{ backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 24, paddingTop: 8, width: "100%", maxWidth: 480, alignSelf: "center" }}>
            <Text style={{ color: c.muted, fontSize: 14, paddingHorizontal: 20, paddingVertical: 10 }} numberOfLines={1}>
              {place.name}
            </Text>
            <Option label={t("food:share.kakao")} onPress={() => pick("kakao")} />
            <Option label={t("food:share.tesla")} onPress={() => pick("tesla")} />
            <Option label={t("food:share.more")} onPress={() => pick("more")} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
