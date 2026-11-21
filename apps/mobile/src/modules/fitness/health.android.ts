import { heartStats, type HealthSession } from "@wanderbar/route";
import { Linking } from "react-native";
import {
  ExerciseSegmentType,
  ExerciseType,
  SdkAvailabilityStatus,
  aggregateRecord,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  insertRecords,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
} from "react-native-health-connect";

/**
 * Health Connect on Android: finished workouts are written as exercise sessions (Samsung Health syncs them
 * from there), and the heart rate and calories a watch recorded during the workout are read back for the
 * summary. Nothing here goes to our server.
 */
export const healthSupported = true;
export type HealthState = "unavailable" | "needsInstall" | "off" | "on";

const PERMISSIONS = [
  { accessType: "write", recordType: "ExerciseSession" },
  { accessType: "read", recordType: "HeartRate" },
  { accessType: "read", recordType: "ActiveCaloriesBurned" },
] as const;

let ready: Promise<boolean> | null = null;
const init = () => (ready ??= initialize().catch(() => false));

export async function healthState(): Promise<HealthState> {
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) return "unavailable";
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return "needsInstall";
    if (!(await init())) return "unavailable";
    const granted = await getGrantedPermissions();
    const canWrite = granted.some((p) => p.recordType === "ExerciseSession" && p.accessType === "write");
    return canWrite ? "on" : "off";
  } catch {
    return "unavailable";
  }
}

/** Health Connect's own permission screen; true when saving workouts is allowed. */
export async function connectHealth() {
  try {
    if (!(await init())) return false;
    const granted = await requestPermission([...PERMISSIONS]);
    return granted.some((p) => "recordType" in p && p.recordType === "ExerciseSession" && p.accessType === "write");
  } catch {
    return false;
  }
}

export function openHealthSettings() {
  try {
    openHealthConnectSettings();
  } catch {
    // Older phones: the Health Connect app in the Play Store.
    Linking.openURL("market://details?id=com.google.android.apps.healthdata").catch(() => {});
  }
}

/**
 * Writes the workout (once: the workout id is the record's client id, so sending it again replaces it).
 * If Health Connect refuses the per-set segments, the session goes without them.
 */
export async function saveSession(s: HealthSession) {
  if (!(await init())) return false;
  const base = {
    recordType: "ExerciseSession" as const,
    exerciseType: ExerciseType.STRENGTH_TRAINING,
    startTime: s.startTime,
    endTime: s.endTime,
    title: s.title,
    notes: s.notes,
    metadata: { clientRecordId: s.id, clientRecordVersion: Date.now() },
  };
  const segments = s.segments.map((x) => ({ startTime: x.startTime, endTime: x.endTime, segmentType: ExerciseSegmentType[x.kind], repetitions: x.repetitions }));
  try {
    await insertRecords([{ ...base, segments }]);
    return true;
  } catch {
    try {
      await insertRecords([base]);
      return true;
    } catch {
      return false;
    }
  }
}

/** Heart rate (average, highest) and active calories during the workout, if a watch recorded them. */
export async function readWorkoutBody(from: string, to: string) {
  const timeRangeFilter = { operator: "between" as const, startTime: from, endTime: to };
  const out: { heart: { avg: number; max: number } | null; kcal: number | null } = { heart: null, kcal: null };
  if (!(await init())) return out;
  try {
    const { records } = await readRecords("HeartRate", { timeRangeFilter });
    const h = heartStats(records.flatMap((r) => r.samples));
    out.heart = h && { avg: h.avg, max: h.max };
  } catch {}
  try {
    const agg = await aggregateRecord({ recordType: "ActiveCaloriesBurned", timeRangeFilter });
    const kcal = Math.round(agg.ACTIVE_CALORIES_TOTAL.inKilocalories);
    out.kcal = kcal > 0 ? kcal : null;
  } catch {}
  return out;
}
