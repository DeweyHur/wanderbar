import type { CheckKey, Quick, Room, ScoreKey, Stage } from "@wanderbar/route";
import { api } from "@/core/api";

export type PropertySummary = {
  id: string;
  address: string;
  city: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  stage: Stage;
  openHouse: string;
  tours: number;
  lastVisited: string | null;
  avgOverall: number | null;
  myOverall: number | null;
  myQuick: Quick | null;
  coverUrl: string | null;
  updatedAt: string;
};

export type Tour = {
  id: string;
  userId: string;
  name: string;
  mine: boolean;
  visitedOn: string;
  overall: number | null;
  quick: Quick | null;
  scores: Partial<Record<ScoreKey, number>>;
  checks: Partial<Record<CheckKey, boolean>>;
  roomNotes: Partial<Record<Room, string>>;
  pros: string;
  cons: string;
  agent: string;
  heard: string;
  updatedAt: string;
};
export type TourDetail = Tour & { propertyId: string; address: string };

export type Facts = {
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  hoaMonthly: number | null;
};
export type Property = Facts & {
  id: string;
  groupId: string;
  memo: string;
  createdBy: string;
  canDelete: boolean;
  address: string;
  city: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  stage: Stage;
  rejectReason: string;
  openHouse: string;
  updatedAt: string;
  links: { id: string; kind: "zillow" | "redfin" | "realtor"; url: string }[];
  tours: Tour[];
};

export type NewProperty = Partial<Facts> & {
  url?: string;
  googlePlaceId?: string;
  sessionToken?: string;
  address?: string;
  stage?: Stage;
  openHouse?: string;
  memo?: string;
};
export type PropertyEdit = Partial<Facts> & { address?: string; stage?: Stage; rejectReason?: string; url?: string; openHouse?: string; memo?: string };
export type TourEdit = Partial<{
  visitedOn: string;
  overall: number | null;
  quick: Quick | null;
  scores: Partial<Record<ScoreKey, number | null>>;
  checks: Partial<Record<CheckKey, boolean | null>>;
  roomNotes: Partial<Record<Room, string>>;
  pros: string;
  cons: string;
  agent: string;
  heard: string;
}>;

export const reApi = {
  list: (groupId: string) => api<{ properties: PropertySummary[] }>(`/api/groups/${groupId}/properties`).then((r) => r.properties),
  create: (groupId: string, p: NewProperty) => api<{ property: Property; created: boolean }>(`/api/groups/${groupId}/properties`, { body: p }),
  get: (id: string) => api<Property>(`/api/properties/${id}`),
  update: (id: string, e: PropertyEdit) => api<Property>(`/api/properties/${id}`, { method: "PATCH", body: e }),
  remove: (id: string) => api(`/api/properties/${id}`, { method: "DELETE" }),
  removeLink: (id: string, linkId: string) => api<Property>(`/api/properties/${id}/links/${linkId}`, { method: "DELETE" }),
  startTour: (id: string, t: TourEdit = {}) => api<TourDetail>(`/api/properties/${id}/tours`, { body: t }),
  tour: (id: string) => api<TourDetail>(`/api/tours/${id}`),
  saveTour: (id: string, t: TourEdit) => api<TourDetail>(`/api/tours/${id}`, { method: "PUT", body: t }),
  removeTour: (id: string) => api(`/api/tours/${id}`, { method: "DELETE" }),
};
