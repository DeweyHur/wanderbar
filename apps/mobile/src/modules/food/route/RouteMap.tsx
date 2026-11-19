import { Platform, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import type { RouteResult } from "./google";
import { MARK_COLORS, markColor, markRegion, type MapMark } from "./mapMarks";

/**
 * The route's pins (numbered stops, hotels, and the group's places that could be added) with the driving
 * path, or straight lines when there's no route yet. Tapping a pin selects it. Android: Google Maps; iOS: Apple Maps.
 */
export function RouteMap({
  marks,
  route,
  selected,
  onSelect,
}: {
  marks: MapMark[];
  route: RouteResult | null;
  selected?: string | null;
  onSelect?: (key: string) => void;
}) {
  const box = markRegion(marks);
  if (!box) return null;
  const pad = 0.02;
  const region = {
    latitude: (box.south + box.north) / 2,
    longitude: (box.west + box.east) / 2,
    latitudeDelta: box.north - box.south + pad,
    longitudeDelta: box.east - box.west + pad,
  };
  const routed = marks.filter((m) => m.kind === "stop" && m.status !== "skipped");
  return (
    <View testID="route-map" style={{ height: 420, borderRadius: 16, overflow: "hidden" }}>
      <MapView style={{ flex: 1 }} provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined} initialRegion={region}>
        {marks.map((m) => (
          <Marker
            key={`${m.key}-${m.key === selected ? "on" : "off"}`}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.n ? `${m.n}. ${m.title}` : m.kind === "hotel" ? `🏨 ${m.title}` : m.title}
            pinColor={markColor(m)}
            opacity={m.kind === "place" && m.key !== selected ? 0.75 : 1}
            zIndex={m.key === selected ? 10 : m.kind === "place" ? 1 : 5}
            onPress={() => onSelect?.(m.key)}
          />
        ))}
        {route
          ? route.legs.map((leg, i) => (
              <Polyline
                key={i}
                coordinates={leg.path.map(([latitude, longitude]) => ({ latitude, longitude }))}
                strokeWidth={5}
                // Legs already driven (into a done stop) are greyed.
                strokeColor={routed[i + 1]?.status === "done" ? "#9A9BA1" : MARK_COLORS.current}
              />
            ))
          : routed.length > 1 && (
              <Polyline coordinates={routed.map((m) => ({ latitude: m.lat, longitude: m.lng }))} strokeWidth={3} strokeColor={MARK_COLORS.pending} />
            )}
      </MapView>
    </View>
  );
}
