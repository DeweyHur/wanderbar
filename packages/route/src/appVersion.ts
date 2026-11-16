/** "0.4.0" vs "0.10.1": -1, 0 or 1, number by number (missing parts count as 0; junk counts as 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** True when this app must be updated before it can be used (unknown versions are let through). */
export function needsUpdate(appVersion: string | null | undefined, minVersion: string | null | undefined): boolean {
  if (!appVersion || !minVersion) return false;
  return compareVersions(appVersion, minVersion) < 0;
}
