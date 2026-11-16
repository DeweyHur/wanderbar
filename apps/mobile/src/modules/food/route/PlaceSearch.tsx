import { formatPlaceDistance, matchVisited, sortFound, usZip } from "@wanderbar/route";
import { getLocales } from "expo-localization";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Field, Text, TextInput, useColors } from "@/components/ui";
import { myLocation, type Here } from "@/core/location";
import { prefs } from "@/core/platform/prefs";
import { placeDetails, suggestPlaces, useGoogleAvailable, visitedPlaces, zipCenter, type PlaceDetails, type Suggestion, type VisitedPlace } from "./google";

type Zip = { zip: string; lat: number; lng: number; label: string };
const ZIP_PREF = "placeSearchZip";
const miles = () => getLocales()[0]?.regionCode === "US";

/**
 * Google-Maps-style suggestions under a text field (search-first adding, as in the old app).
 * When the server has no Google key it is just the text field.
 *
 * `around`: a ZIP box beside the field; suggestions are measured from that ZIP (or, when it's empty, from
 * where you are) and listed nearest first. `visitedGroupId`: places you've finished on your routes in that
 * group come first.
 */
export function PlaceSearch({
  value,
  onChangeText,
  onPick,
  onPickSuggestion,
  onSubmit,
  near,
  label,
  placeholder,
  hint,
  around,
  visitedGroupId,
}: {
  value: string;
  onChangeText: (s: string) => void;
  onPick?: (p: PlaceDetails) => void;
  /** Instead of onPick: just the suggestion, when the server fetches the details (pass it takeSession()). */
  onPickSuggestion?: (s: Suggestion) => void;
  /** Enter: receives the top suggestion if there is one (and the text has no commas). */
  onSubmit?: (top: Suggestion | null) => void;
  near?: { lat: number; lng: number } | null;
  label?: string;
  placeholder?: string;
  hint?: string;
  around?: boolean;
  visitedGroupId?: string;
}) {
  const { t } = useTranslation();
  const c = useColors();
  const googleAvailable = useGoogleAvailable();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [visited, setVisited] = useState<VisitedPlace[]>([]);
  const [here, setHere] = useState<Here | null>(null);
  const [zip, setZip] = useState<Zip | null>(null);
  const [zipText, setZipText] = useState("");
  const [zipError, setZipError] = useState(false);
  const seq = useRef(0);

  // Where distances are measured from: the ZIP typed beside the field, else where you are.
  const origin: Here | null = around ? (zip ?? here) : null;

  useEffect(() => {
    if (!around) return;
    prefs.get(ZIP_PREF).then((v) => {
      try {
        const z = v ? (JSON.parse(v) as Zip) : null;
        if (z?.zip) {
          setZip(z);
          setZipText(z.zip);
        }
      } catch {}
    }, () => {});
    myLocation().then(setHere);
  }, [around]);

  useEffect(() => {
    if (visitedGroupId && onPick) visitedPlaces(visitedGroupId).then(setVisited, () => {});
  }, [visitedGroupId, onPick]);

  const changeZip = (s: string) => {
    const clean = s.replace(/[^\d-]/g, "").slice(0, 10);
    setZipText(clean);
    setZipError(false);
    const z = usZip(clean);
    if (!clean) {
      setZip(null);
      prefs.set(ZIP_PREF, "").catch(() => {});
    } else if (z && z !== zip?.zip) {
      zipCenter(z).then(
        (found) => {
          setZip(found);
          prefs.set(ZIP_PREF, JSON.stringify(found)).catch(() => {});
        },
        () => setZipError(true),
      );
    }
  };

  useEffect(() => {
    const q = value.trim();
    if (!googleAvailable || q.length < 2 || q.includes(",")) return setItems([]);
    const n = ++seq.current;
    const h = setTimeout(() => {
      suggestPlaces(q, near ?? origin, origin)
        .then((r) => n === seq.current && setItems(r))
        .catch(() => n === seq.current && setItems([]));
    }, 300);
    return () => clearTimeout(h);
  }, [value, near?.lat, near?.lng, origin?.lat, origin?.lng, googleAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  const been = onPick && value.trim().length >= 1 && !value.includes(",") ? matchVisited(visited, value, origin) : [];
  const shown = (around ? sortFound(items, new Set(been.map((b) => b.googlePlaceId).filter(Boolean))) : items).slice(0, 5);
  const inMiles = miles();

  const pick = async (s: Suggestion) => {
    setItems([]);
    if (onPickSuggestion) return onPickSuggestion(s);
    onPick?.(await placeDetails(s.placeId));
  };
  const pickVisited = (v: VisitedPlace) => {
    setItems([]);
    onPick?.({ googlePlaceId: v.googlePlaceId, name: v.name, address: v.address, lat: v.lat, lng: v.lng, mapsUrl: v.mapsUrl, hoursRaw: v.hoursRaw });
  };
  const distance = (m: number | null | undefined) =>
    m == null ? null : <Text style={{ color: c.muted, fontSize: 13, marginLeft: 8 }}>{formatPlaceDistance(m, inMiles)}</Text>;

  const field = (
    <Field
      label={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      hint={hint}
      onSubmitEditing={
        onSubmit
          ? () => (been[0] && !value.includes(",") ? pickVisited(been[0]) : shown[0] && !value.includes(",") ? pick(shown[0]) : onSubmit(null))
          : undefined
      }
    />
  );

  return (
    <View style={{ gap: 6 }}>
      {around ? (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <View style={{ flex: 1 }}>{field}</View>
          <TextInput
            testID="place-zip"
            accessibilityLabel={t("food:route.zip")}
            value={zipText}
            onChangeText={changeZip}
            placeholder={t("food:route.zip")}
            placeholderTextColor={c.muted}
            keyboardType="number-pad"
            maxLength={10}
            style={{
              width: 84,
              color: c.text,
              backgroundColor: c.card,
              borderColor: zipError ? c.danger : c.border,
              borderWidth: 1.5,
              borderRadius: 14,
              paddingHorizontal: 10,
              paddingVertical: 12,
              fontSize: 16,
              textAlign: "center",
            }}
          />
        </View>
      ) : (
        field
      )}
      {around && (zip || here || zipError) ? (
        <Text testID="place-origin" style={{ color: zipError ? c.danger : c.muted, fontSize: 13 }}>
          {zipError ? t("food:route.zipNotFound") : zip ? t("food:route.nearZip", { place: zip.label }) : t("food:route.nearMe")}
        </Text>
      ) : null}
      {been.map((v) => (
        <Pressable
          key={`v-${v.key}`}
          testID="visited-suggestion"
          onPress={() => pickVisited(v)}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.pinkSoft, flexDirection: "row", alignItems: "center" }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
              🕘 {v.name}
            </Text>
            <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
              {[v.address, t("food:route.beenThere", { date: v.last.slice(5).replace("-", "/"), count: v.times })].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {distance(v.meters)}
        </Pressable>
      ))}
      {shown.map((s) => (
        <Pressable
          key={s.placeId}
          testID="place-suggestion"
          onPress={() => pick(s)}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.card, flexDirection: "row", alignItems: "center" }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
              {s.primary}
            </Text>
            {s.secondary ? (
              <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
                {s.secondary}
              </Text>
            ) : null}
          </View>
          {around ? distance(s.distanceMeters) : null}
        </Pressable>
      ))}
    </View>
  );
}
