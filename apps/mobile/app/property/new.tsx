import { parseListingUrl } from "@wanderbar/route";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { FormScroll } from "@/components/FormScroll";
import { Body, Button, Chip, ErrorText, Field, Text, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { takeSession, useGoogleAvailable } from "@/modules/food/route/google";
import { PlaceSearch } from "@/modules/food/route/PlaceSearch";
import { reApi, type NewProperty } from "@/modules/realestate/api";
import { parseNum, SectionTitle } from "@/modules/realestate/parts";

type Start = "interested" | "to_tour" | "now";

/** Add a house: paste a listing link (the address is read from it), search the address, or type it. */
export default function NewProperty() {
  const { groupId, url: sharedUrl } = useLocalSearchParams<{ groupId: string; url?: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const googleAvailable = useGoogleAvailable();
  const [link, setLink] = useState(sharedUrl ?? "");
  const [search, setSearch] = useState("");
  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [sqft, setSqft] = useState("");
  const [openHouse, setOpenHouse] = useState("");
  const [start, setStart] = useState<Start>("now");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsed = link.trim() ? parseListingUrl(link) : null;

  const save = async (where: Pick<NewProperty, "url" | "googlePlaceId" | "sessionToken" | "address">) => {
    const facts = { price: parseNum(price), beds: parseNum(beds, false), baths: parseNum(baths, false), sqft: parseNum(sqft) };
    if (Object.values(facts).some((v) => v === undefined)) return setError(t("realestate:new.badNumbers"));
    setBusy(true);
    setError("");
    try {
      const { property, created } = await reApi.create(groupId, {
        ...where,
        ...(facts as Record<string, number | null>),
        openHouse: openHouse.trim(),
        stage: start === "interested" ? "interested" : "to_tour",
      });
      if (start === "now") {
        const tour = await reApi.startTour(property.id);
        router.replace({ pathname: "/property/[id]", params: { id: property.id } });
        router.push({ pathname: "/tour/[id]", params: { id: tour.id } });
      } else router.replace({ pathname: "/property/[id]", params: { id: property.id, ...(created ? {} : { existing: "1" }) } });
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };

  const ready = !!parsed || !!address.trim();
  const submit = () => (parsed ? save({ url: link }) : save({ address: address.trim() }));

  return (
    <FormScroll style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t("realestate:new.title") }} />
      <Field label={t("realestate:new.link")} value={link} onChangeText={setLink} placeholder="https://www.zillow.com/homedetails/…" hint={t("realestate:new.linkHint")} />
      {link.trim() ? (
        parsed ? (
          <Text testID="link-address" style={{ color: c.accent, fontWeight: "700" }}>
            {t("realestate:new.linkFound", { address: parsed.address })}
          </Text>
        ) : (
          <Body muted>{t("realestate:new.linkUnreadable")}</Body>
        )
      ) : null}
      {!parsed && (
        <>
          {googleAvailable && (
            <PlaceSearch
              label={t("realestate:new.search")}
              value={search}
              onChangeText={setSearch}
              onPickSuggestion={(s) => save({ googlePlaceId: s.placeId, sessionToken: takeSession() })}
            />
          )}
          <Field label={t("realestate:new.address")} value={address} onChangeText={setAddress} placeholder="1234 Main St, Torrance, CA 90501" />
        </>
      )}

      <SectionTitle>{t("realestate:new.stage")}</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Chip label={t("realestate:new.seenToday")} selected={start === "now"} onPress={() => setStart("now")} />
        <Chip label={t("realestate:stage.to_tour")} selected={start === "to_tour"} onPress={() => setStart("to_tour")} />
        <Chip label={t("realestate:stage.interested")} selected={start === "interested"} onPress={() => setStart("interested")} />
      </View>

      <SectionTitle>{t("realestate:new.facts")}</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <View style={{ flexBasis: 160, flexGrow: 1 }}>
          <Field label={t("realestate:facts.price")} value={price} onChangeText={setPrice} placeholder="$" />
        </View>
        <View style={{ flexBasis: 70, flexGrow: 1 }}>
          <Field label={t("realestate:facts.beds")} value={beds} onChangeText={setBeds} />
        </View>
        <View style={{ flexBasis: 70, flexGrow: 1 }}>
          <Field label={t("realestate:facts.baths")} value={baths} onChangeText={setBaths} />
        </View>
        <View style={{ flexBasis: 100, flexGrow: 1 }}>
          <Field label={t("realestate:facts.sqft")} value={sqft} onChangeText={setSqft} />
        </View>
      </View>
      <Field label={t("realestate:facts.openHouse")} value={openHouse} onChangeText={setOpenHouse} placeholder={t("realestate:facts.openHousePlaceholder")} />
      <Button label={t("realestate:new.save")} busy={busy} disabled={!ready} onPress={submit} />
      <ErrorText>{error}</ErrorText>
    </FormScroll>
  );
}
