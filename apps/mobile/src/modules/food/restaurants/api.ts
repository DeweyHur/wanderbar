import { api } from "@/core/api";

/** Group average in stars (one decimal) and how many ratings it's from. */
export type RatingSummary = { avg: number | null; count: number };

export type RestaurantSummary = {
  id: string;
  name: string;
  category: string | null;
  address: string;
  hoursRaw: string;
  lat: number | null;
  lng: number | null;
  yelpUrl: string;
  mapsUrl: string;
  menuCount: number;
  rating: RatingSummary;
  hasPhoto: boolean;
  coverPhotoId: string | null;
  lastVisitedAt: string | null;
};
export type Menu = { id: string; name: string; memo: string; priceMinor: number | null; currency: string; rating: RatingSummary; myStars: number | null };
export type MenuDetail = {
  id: string;
  name: string;
  memo: string;
  priceMinor: number | null;
  currency: string;
  restaurant: { id: string; name: string };
  rating: RatingSummary;
  mine: { stars: number; review: string } | null;
  ratings: { userId: string; name: string; stars: number; review: string; updatedAt: string }[];
};
export type Restaurant = {
  id: string;
  groupId: string;
  name: string;
  category: string | null;
  memo: string;
  createdBy: string;
  address: string;
  hoursRaw: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string;
  hasPhoto: boolean;
  coverPhotoId: string | null;
  visits: Visit[];
  yelpUrl: string;
  mapsUrl: string;
  currency: string;
  rating: RatingSummary;
  menus: Menu[];
};
export type Visit = { id: string; userId: string; name: string; visitedAt: string; fromRoute: boolean };
export type NewRestaurant = {
  name?: string;
  address?: string;
  yelpUrl?: string;
  mapsUrl?: string;
  googlePlaceId?: string;
  sessionToken?: string;
  category?: string | null;
};
export type RestaurantEdit = Partial<Pick<Restaurant, "name" | "address" | "hoursRaw" | "yelpUrl" | "mapsUrl" | "category" | "memo">>;
export type MenuInput = { name?: string; priceMinor?: number | null; memo?: string };

export const restaurantApi = {
  list: (groupId: string) => api<{ restaurants: RestaurantSummary[] }>(`/api/groups/${groupId}/restaurants`).then((r) => r.restaurants),
  /** Saves, or returns the one already saved (created=false) when the Yelp/Google place matches. */
  create: (groupId: string, r: NewRestaurant) => api<{ restaurant: Restaurant; created: boolean }>(`/api/groups/${groupId}/restaurants`, { body: r }),
  get: (id: string) => api<Restaurant>(`/api/restaurants/${id}`),
  update: (id: string, edit: RestaurantEdit) => api<Restaurant>(`/api/restaurants/${id}`, { method: "PATCH", body: edit }),
  remove: (id: string) => api(`/api/restaurants/${id}`, { method: "DELETE" }),
  linkGoogle: (id: string, pick?: { placeId: string; sessionToken: string }) => api<Restaurant>(`/api/restaurants/${id}/google`, { body: pick ?? {} }),
  addMenu: (id: string, m: MenuInput) => api<Restaurant>(`/api/restaurants/${id}/menus`, { body: m }),
  updateMenu: (menuId: string, m: MenuInput) => api<Restaurant>(`/api/menus/${menuId}`, { method: "PATCH", body: m }),
  deleteMenu: (menuId: string) => api<Restaurant>(`/api/menus/${menuId}`, { method: "DELETE" }),
  addVisit: (id: string) => api<Restaurant>(`/api/restaurants/${id}/visits`, { body: {} }),
  deleteVisit: (visitId: string) => api<Restaurant>(`/api/visits/${visitId}`, { method: "DELETE" }),
  getMenu: (menuId: string) => api<MenuDetail>(`/api/menus/${menuId}`),
  rate: (menuId: string, stars: number, review: string) => api<MenuDetail>(`/api/menus/${menuId}/rating`, { method: "PUT", body: { stars, review } }),
  unrate: (menuId: string) => api<MenuDetail>(`/api/menus/${menuId}/rating`, { method: "DELETE" }),
};
