import { api } from "@/core/api";
import type { RatingSummary } from "../restaurants/api";

export type DishSummary = { id: string; coverPhotoId: string | null; name: string; category: string | null; memo: string; rating: RatingSummary; lastMadeAt: string | null; madeCount: number };
export type Dish = {
  id: string;
  groupId: string;
  name: string;
  category: string | null;
  memo: string;
  createdBy: string;
  rating: RatingSummary;
  mine: { stars: number; review: string } | null;
  ratings: { userId: string; name: string; stars: number; review: string; updatedAt: string }[];
  made: { id: string; userId: string; name: string; madeAt: string }[];
};
export type DishInput = { name?: string; category?: string | null; memo?: string };

/** Dishes made at home. */
export const dishApi = {
  list: (groupId: string) => api<{ dishes: DishSummary[] }>(`/api/groups/${groupId}/dishes`).then((r) => r.dishes),
  create: (groupId: string, d: DishInput) => api<Dish>(`/api/groups/${groupId}/dishes`, { body: d }),
  get: (id: string) => api<Dish>(`/api/dishes/${id}`),
  update: (id: string, d: DishInput) => api<Dish>(`/api/dishes/${id}`, { method: "PATCH", body: d }),
  remove: (id: string) => api(`/api/dishes/${id}`, { method: "DELETE" }),
  rate: (id: string, stars: number, review: string) => api<Dish>(`/api/dishes/${id}/rating`, { method: "PUT", body: { stars, review } }),
  unrate: (id: string) => api<Dish>(`/api/dishes/${id}/rating`, { method: "DELETE" }),
  made: (id: string) => api<Dish>(`/api/dishes/${id}/made`, { body: {} }),
  deleteMade: (id: string, madeId: string) => api<Dish>(`/api/dishes/${id}/made/${madeId}`, { method: "DELETE" }),
};
