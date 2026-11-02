import { DEFAULT_TESLA_FORMAT, type TeslaFormat, wallTime, type WallTime } from "@wanderbar/route";
import { useCallback, useEffect, useState } from "react";
import { devicePlatform } from "@/core/platform/tesla";
import { routeApi } from "./api";

/** Current wall-clock time, refreshed every 30 s (like the old app) so open/closed badges stay right. */
export function useNow(): WallTime {
  const [now, setNow] = useState(() => wallTime(new Date()));
  useEffect(() => {
    const id = setInterval(() => setNow(wallTime(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** The Tesla text format saved for this phone platform (address-only until the tester says otherwise). */
export function useTeslaFormat() {
  const [format, setFormat] = useState<TeslaFormat>(DEFAULT_TESLA_FORMAT);
  const [saved, setSaved] = useState<TeslaFormat | null>(null);
  useEffect(() => {
    if (!devicePlatform) return;
    routeApi
      .getTeslaFormat(devicePlatform)
      .then((f) => {
        setSaved(f);
        if (f) setFormat(f);
      })
      .catch(() => {});
  }, []);
  const save = useCallback(async (f: TeslaFormat) => {
    if (!devicePlatform) return;
    await routeApi.setTeslaFormat(devicePlatform, f);
    setSaved(f);
    setFormat(f);
  }, []);
  return { format, saved, save };
}
