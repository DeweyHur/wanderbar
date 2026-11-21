import type { HealthSession } from "@wanderbar/route";

/**
 * Health Connect (Samsung Health, Google's health apps) is Android only; on iPhone and the web there's
 * nothing to connect yet (HealthKit later).
 */
export const healthSupported = false;
export type HealthState = "unavailable" | "needsInstall" | "off" | "on";
export const healthState = async (): Promise<HealthState> => "unavailable";
export const connectHealth = async (): Promise<boolean> => false;
export const openHealthSettings = () => {};
export const saveSession = async (_s: HealthSession): Promise<boolean> => false;
export const readWorkoutBody = async (_from: string, _to: string): Promise<{ heart: { avg: number; max: number } | null; kcal: number | null }> => ({ heart: null, kcal: null });
