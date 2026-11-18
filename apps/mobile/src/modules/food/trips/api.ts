import { api } from "@/core/api";

export type Transport = "car" | "flight" | "train" | "bus" | "other";
export const TRANSPORTS: Transport[] = ["car", "flight", "train", "bus", "other"];
export const TRANSPORT_ICON: Record<Transport, string> = { car: "🚗", flight: "✈️", train: "🚆", bus: "🚌", other: "🧳" };

export type Hotel = {
  id: string;
  tripId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string;
  mapsUrl: string;
  /** The nights from checkIn up to (not including) checkOut. */
  checkIn: string;
  checkOut: string;
};
export type TripDay = { planId: string; date: string | null; title: string; total: number; finished: number; hotel: { id: string; name: string } | null };
export type Trip = {
  id: string;
  groupId: string;
  title: string;
  startDate: string;
  endDate: string;
  transport: Transport;
  rentalCar: boolean;
  hotels: Hotel[];
  days: TripDay[];
};
export type TripSummary = Omit<Trip, "hotels" | "days"> & { hotels: string[] };
export type HotelFields = Partial<Pick<Hotel, "name" | "address" | "lat" | "lng" | "googlePlaceId" | "mapsUrl" | "checkIn" | "checkOut">>;
export type TripEdit = Partial<Pick<Trip, "title" | "startDate" | "endDate" | "transport" | "rentalCar">>;

/** A trip day's hotel, as the route screen gets it. */
export type DayHotel = Pick<Hotel, "id" | "name" | "address" | "lat" | "lng" | "googlePlaceId" | "mapsUrl">;

export const tripApi = {
  list: (groupId: string) => api<{ trips: TripSummary[] }>(`/api/groups/${groupId}/trips`).then((r) => r.trips),
  create: (groupId: string, t: TripEdit & { startDate: string; endDate: string }) => api<Trip>(`/api/groups/${groupId}/trips`, { body: t }),
  get: (id: string) => api<Trip>(`/api/trips/${id}`),
  update: (id: string, edit: TripEdit) => api<Trip>(`/api/trips/${id}`, { method: "PATCH", body: edit }),
  remove: (id: string) => api(`/api/trips/${id}`, { method: "DELETE" }),
  addHotel: (tripId: string, h: HotelFields & { name: string; checkIn: string; checkOut: string }) =>
    api<Trip>(`/api/trips/${tripId}/hotels`, { body: h }),
  updateHotel: (hotelId: string, h: HotelFields) => api<Trip>(`/api/hotels/${hotelId}`, { method: "PATCH", body: h }),
  removeHotel: (hotelId: string) => api<Trip>(`/api/hotels/${hotelId}`, { method: "DELETE" }),
};

/** Nights between two days (check-in to check-out). */
export const nights = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** Getting around there without a car: directions by transit. */
export const carless = (t: { transport: Transport; rentalCar: boolean }) => t.transport !== "car" && !t.rentalCar;
