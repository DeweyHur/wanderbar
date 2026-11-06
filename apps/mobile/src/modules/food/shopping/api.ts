import { api } from "@/core/api";

export type Slot = "lunch" | "dinner";
export const SLOTS: Slot[] = ["lunch", "dinner"];

export type ShoppingItem = {
  id: string;
  name: string;
  qty: string;
  dishId: string | null;
  dishName: string | null;
  mealId: string | null;
  meal: { slot: Slot; date: string | null; planId: string | null } | null;
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
  createdAt: string;
};
export type Meal = { id: string; slot: Slot; dishId: string | null; name: string; shopping: ShoppingItem[] };
export type ShoppingInput = { name: string; qty?: string; dishId?: string | null; mealId?: string | null };

/** Lunch and dinner on a day at home. */
export const mealApi = {
  list: (planId: string) => api<{ meals: Meal[] }>(`/api/plans/${planId}/meals`).then((r) => r.meals),
  add: (planId: string, m: { slot: Slot; dishId?: string | null; title?: string }) => api<{ meals: Meal[] }>(`/api/plans/${planId}/meals`, { body: m }).then((r) => r.meals),
  remove: (mealId: string) => api<{ meals: Meal[] }>(`/api/meals/${mealId}`, { method: "DELETE" }).then((r) => r.meals),
};

/** The group's shopping list. */
export const shoppingApi = {
  list: (groupId: string) => api<{ items: ShoppingItem[] }>(`/api/groups/${groupId}/shopping`).then((r) => r.items),
  add: (groupId: string, i: ShoppingInput) => api<{ items: ShoppingItem[] }>(`/api/groups/${groupId}/shopping`, { body: i }).then((r) => r.items),
  update: (id: string, edit: { done?: boolean; name?: string; qty?: string }) => api<ShoppingItem>(`/api/shopping/${id}`, { method: "PATCH", body: edit }),
  remove: (id: string) => api(`/api/shopping/${id}`, { method: "DELETE" }),
  clearBought: (groupId: string) => api<{ items: ShoppingItem[] }>(`/api/groups/${groupId}/shopping`, { method: "DELETE" }).then((r) => r.items),
};
