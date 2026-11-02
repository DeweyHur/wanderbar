import type { StopStatus, TeslaFormat } from "@wanderbar/route";
import { api } from "@/core/api";

export type Stop = {
  id: string;
  planId: string;
  name: string;
  memo: string;
  address: string;
  mapsUrl: string;
  hoursRaw: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string;
  orderIndex: number;
  status: StopStatus;
};
export type Plan = { id: string; groupId: string; title: string; createdAt: string; stops: Stop[] };
export type PlanSummary = { id: string; title: string; createdAt: string; total: number; finished: number; currentName: string | null };
export type StopFields = Partial<Pick<Stop, "name" | "memo" | "address" | "mapsUrl" | "hoursRaw" | "lat" | "lng" | "googlePlaceId">>;
export type FlowAction =
  | { action: "complete" | "postpone" | "drop" | "setCurrent" | "restore"; stopId: string }
  | { action: "move"; from: number; to: number }
  | { action: "restart" };

export const routeApi = {
  list: (groupId: string) => api<{ plans: PlanSummary[] }>(`/api/groups/${groupId}/plans`).then((r) => r.plans),
  create: (groupId: string, title: string) => api<Plan>(`/api/groups/${groupId}/plans`, { body: { title } }),
  get: (planId: string) => api<Plan>(`/api/plans/${planId}`),
  rename: (planId: string, title: string) => api<Plan>(`/api/plans/${planId}`, { method: "PATCH", body: { title } }),
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
