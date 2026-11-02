import { Platform, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import type { Stop } from "./api";
import type { RouteResult } from "./google";

const COLORS = { current: "#2F6FED", pending: "#E8590C", done: "#1F8A5B", skipped: "#999999" } as const;

/**
 * Numbered markers in route order (blue = now, orange = upcoming, green = done) with the driving path,
 * or straight lines when there's no route yet. Android: Google Maps; iOS: Apple Maps.
 */
export function RouteMap({ stops, route }: { stops: Stop[]; route: RouteResult | null }) {
  const located = stops.filter((s) => s.lat != null && s.lng != null);
  if (!located.length) return null;
  const lats = located.map((s) => s.lat!);
  const lngs = located.map((s) => s.lng!);
  const pad = 0.02;
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(...lats) - Math.min(...lats) + pad,
    longitudeDelta: Math.max(...lngs) - Math.min(...lngs) + pad,
  };
  const routed = located.filter((s) => s.status !== "skipped");
  return (
    <View style={{ height: 380, borderRadius: 16, overflow: "hidden" }}>
      <MapView style={{ flex: 1 }} provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined} initialRegion={region}>
        {located.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.lat!, longitude: s.lng! }}
            title={`${stops.indexOf(s) + 1}. ${s.name}`}
            description={s.address}
            pinColor={COLORS[s.status]}
          />
        ))}
        {route
          ? route.legs.map((leg, i) => (
              <Polyline
                key={i}
                coordinates={leg.path.map(([latitude, longitude]) => ({ latitude, longitude }))}
                strokeWidth={5}
                // Legs already driven (into a done stop) are greyed.
                strokeColor={routed[i + 1]?.status === "done" ? "#9A9BA1" : COLORS.current}
              />
            ))
          : routed.length > 1 && (
              <Polyline coordinates={routed.map((s) => ({ latitude: s.lat!, longitude: s.lng! }))} strokeWidth={3} strokeColor={COLORS.pending} />
            )}
      </MapView>
    </View>
  );
}
