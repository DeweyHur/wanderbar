import { tripPlanPrompt, type PromptTrip } from "@wanderbar/route";
import { getLocales } from "expo-localization";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, ScrollView, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Text, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { copyText } from "@/core/platform/clipboard";
import { routeApi } from "@/modules/food/route/api";
import { knownPlaces } from "@/modules/food/route/google";
import type { Trip } from "./api";

/**
 * "Ask an AI to plan it": builds a prompt from the trip (dates, transport, hotels by night, each day's stops)
 * and the group's bookmarked places near each hotel, to copy or open in Claude / ChatGPT.
 */
export function TripPrompt({ trip }: { trip: Trip }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const make = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const [places, plans] = await Promise.all([
        knownPlaces(trip.groupId),
        Promise.all(trip.days.map((d) => (d.total > 0 ? routeApi.get(d.planId) : Promise.resolve(null)))),
      ]);
      const input: PromptTrip = {
        title: trip.title,
        startDate: trip.startDate,
        endDate: trip.endDate,
        transport: trip.transport,
        rentalCar: trip.rentalCar,
        hotels: trip.hotels.map((h) => ({ name: h.name, address: h.address, checkIn: h.checkIn, checkOut: h.checkOut, lat: h.lat, lng: h.lng })),
        days: trip.days.map((d, i) => ({
          date: d.date ?? trip.startDate,
          stops: (plans[i]?.stops ?? []).map((s) => ({ name: s.name, address: s.address, done: s.status === "done" })),
        })),
        places: places.map((p) => ({ name: p.name, address: p.address, lat: p.lat, lng: p.lng, kind: p.source, hoursRaw: p.hoursRaw })),
      };
      setText(tripPlanPrompt(input, i18n.language.startsWith("ko") ? "ko" : "en", { miles: getLocales()[0]?.regionCode === "US" }));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await copyText(text);
    if (Platform.OS === "web") setNotice(t("food:trip.prompt.copied"));
  };

  return (
    <Card testID="trip-prompt-card">
      <Text style={{ color: c.text, fontSize: 17, fontWeight: "700" }}>🤖 {t("food:trip.prompt.title")}</Text>
      <Body muted>{t("food:trip.prompt.hint")}</Body>
      {!text ? (
        <Button label={t("food:trip.prompt.make")} busy={busy} onPress={make} />
      ) : (
        <>
          <ScrollView nestedScrollEnabled style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, maxHeight: 360, backgroundColor: c.bg }} contentContainerStyle={{ padding: 12 }}>
            <Text testID="trip-prompt" selectable style={{ color: c.text, fontSize: 13, lineHeight: 19 }}>
              {text}
            </Text>
          </ScrollView>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button label={t("food:trip.prompt.copy")} onPress={copy} />
            <Chip label={t("food:trip.prompt.openClaude")} onPress={() => Linking.openURL(`https://claude.ai/new?q=${encodeURIComponent(text)}`)} />
            <Chip label={t("food:trip.prompt.openChatGPT")} onPress={() => Linking.openURL(`https://chatgpt.com/?q=${encodeURIComponent(text)}`)} />
            <Chip label={t("food:trip.prompt.again")} onPress={make} />
          </View>
          {notice ? <Body muted>{notice}</Body> : null}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
