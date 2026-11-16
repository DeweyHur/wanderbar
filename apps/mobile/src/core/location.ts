import * as Location from "expo-location";

export type Here = { lat: number; lng: number };
let cached: { at: number; here: Here | null } | null = null;
let asking: Promise<Here | null> | null = null;

/**
 * Roughly where the phone is (asks for permission the first time; null when refused or unavailable).
 * Kept for two minutes so typing in a search box doesn't ask the GPS on every letter.
 */
export function myLocation(): Promise<Here | null> {
  if (cached && Date.now() - cached.at < 120_000) return Promise.resolve(cached.here);
  asking ??= (async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") return null;
      const p =
        (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }).catch(() => null)) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
    } catch {
      return null;
    }
  })().then((here) => {
    cached = { at: Date.now(), here };
    asking = null;
    return here;
  });
  return asking;
}
