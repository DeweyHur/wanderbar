import Ionicons from "@expo/vector-icons/Ionicons";
import { teslaShareTextWithFallback, type Destination } from "@wanderbar/route";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { Button } from "@/components/ui";
import { copyText } from "@/core/platform/clipboard";
import { shareText } from "@/core/platform/share";
import { canSendToTesla } from "@/core/platform/tesla";
import { useTeslaFormat } from "./hooks";

/**
 * A share button for a place: opens the phone's share sheet straight away (pick Tesla, KakaoTalk or
 * anything else there). The text is in the Tesla format chosen in Settings, so Tesla gets a
 * destination it can navigate to. On the web (no Tesla hand-off) it copies the address instead.
 */
export function ShareMenu({ place, onNotice, kind = "primary" }: { place: Destination; onNotice?: (s: string) => void; kind?: "primary" | "plain" }) {
  const { t } = useTranslation();
  const tesla = useTeslaFormat();
  const web = !canSendToTesla;
  const label = web ? t("food:route.copyAddress") : t("food:share.button");
  const press = async () => {
    if (web) {
      await copyText(place.address || place.name);
      onNotice?.(t("food:route.copied"));
    } else await shareText(teslaShareTextWithFallback(tesla.format, place));
  };
  return (
    <Button
      testID="share-button"
      kind={kind}
      label={label}
      onPress={press}
      icon={(color) => <Ionicons name={web ? "copy-outline" : Platform.OS === "ios" ? "share-outline" : "share-social"} size={22} color={color} />}
    />
  );
}
