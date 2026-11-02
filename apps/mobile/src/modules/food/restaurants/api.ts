import { api } from "@/core/api";

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
};
export type Menu = { id: string; name: string; memo: string; priceMinor: number | null; currency: string };
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
  yelpUrl: string;
  mapsUrl: string;
  currency: string;
  menus: Menu[];
};
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
};
