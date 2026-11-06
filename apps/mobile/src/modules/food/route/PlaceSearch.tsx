import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Field, useColors, Text } from "@/components/ui";
import { placeDetails, suggestPlaces, useGoogleAvailable, type PlaceDetails, type Suggestion } from "./google";

/**
 * Google-Maps-style suggestions under a text field (search-first adding, as in the old app).
 * When the server has no Google key it is just the text field.
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
}) {
  const c = useColors();
  const googleAvailable = useGoogleAvailable();
  const [items, setItems] = useState<Suggestion[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const q = value.trim();
    if (!googleAvailable || q.length < 2 || q.includes(",")) return setItems([]);
    const n = ++seq.current;
    const h = setTimeout(() => {
      suggestPlaces(q, near)
        .then((r) => n === seq.current && setItems(r.slice(0, 5)))
        .catch(() => n === seq.current && setItems([]));
    }, 300);
    return () => clearTimeout(h);
  }, [value, near?.lat, near?.lng, googleAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (s: Suggestion) => {
    setItems([]);
    if (onPickSuggestion) return onPickSuggestion(s);
    onPick?.(await placeDetails(s.placeId));
  };

  return (
    <View style={{ gap: 6 }}>
      <Field
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        hint={hint}
        onSubmitEditing={onSubmit ? () => (items[0] && !value.includes(",") ? pick(items[0]) : onSubmit(null)) : undefined}
      />
      {items.map((s) => (
        <Pressable key={s.placeId} onPress={() => pick(s)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.card }}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
            {s.primary}
          </Text>
          {s.secondary ? (
            <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
              {s.secondary}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
