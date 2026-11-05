import type { StopStatus, TeslaFormat } from "@wanderbar/route";
import { api } from "@/core/api";

export type Stop = {
  id: string;
  planId: string;
  name: string;
  memo: string;
  address: string;
  mapsUrl: string;
  yelpUrl: string;
  hoursRaw: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string;
  /** The saved restaurant this stop is, if any. */
  itemId: string | null;
  orderIndex: number;
  status: StopStatus;
};
/** A day route. date is the day it's for (YYYY-MM-DD); an empty title means "call it by its date". */
export type Plan = { id: string; groupId: string; title: string; date: string | null; createdAt: string; stops: Stop[] };
export type PlanSummary = { id: string; title: string; date: string | null; createdAt: string; total: number; finished: number; currentName: string | null };
export type StopFields = Partial<Pick<Stop, "name" | "memo" | "address" | "mapsUrl" | "yelpUrl" | "hoursRaw" | "lat" | "lng" | "googlePlaceId" | "itemId">>;
export type FlowAction =
  | { action: "complete" | "postpone" | "drop" | "setCurrent" | "restore"; stopId: string }
  | { action: "move"; from: number; to: number }
  | { action: "restart" };

export const routeApi = {
  list: (groupId: string) => api<{ plans: PlanSummary[] }>(`/api/groups/${groupId}/plans`).then((r) => r.plans),
  create: (groupId: string, p: { date: string; title?: string }) => api<Plan>(`/api/groups/${groupId}/plans`, { body: p }),
  get: (planId: string) => api<Plan>(`/api/plans/${planId}`),
  update: (planId: string, edit: { title?: string; date?: string }) => api<Plan>(`/api/plans/${planId}`, { method: "PATCH", body: edit }),
  remove: (planId: string) => api(`/api/plans/${planId}`, { method: "DELETE" }),
  addStops: (planId: string, stops: (StopFields & { name: string })[]) =>
    api<{ stops: Stop[] }>(`/api/plans/${planId}/stops`, { body: { stops } }).then((r) => r.stops),
  updateStop: (stopId: string, fields: StopFields) => api<Stop>(`/api/stops/${stopId}`, { method: "PATCH", body: fields }),
  deleteStop: (stopId: string) => api<{ stops: Stop[] }>(`/api/stops/${stopId}`, { method: "DELETE" }).then((r) => r.stops),
  flow: (planId: string, a: FlowAction) => api<{ stops: Stop[] }>(`/api/plans/${planId}/flow`, { body: a }).then((r) => r.stops),
  getTeslaFormat: (platform: "android" | "ios") =>
    api<{ format: TeslaFormat | null }>(`/api/me/tesla-format?platform=${platform}`).then((r) => r.format),
  setTeslaFormat: (platform: "android" | "ios", format: TeslaFormat) =>
    api(`/api/me/tesla-format`, { method: "PUT", body: { platform, format } }),
};
