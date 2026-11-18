import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { planStops, plans, tripHotels, trips } from "../db/schema";
import { badRequest, notFound } from "./errors";
import { requireMember } from "./groups";
import { isDay } from "./plans";

export type Trip = typeof trips.$inferSelect;
export type Hotel = typeof tripHotels.$inferSelect;
export type Transport = Trip["transport"];
export type HotelFields = Partial<Pick<Hotel, "name" | "address" | "lat" | "lng" | "googlePlaceId" | "mapsUrl" | "checkIn" | "checkOut">>;

/** Longest trip, in days: keeps the day routes it makes in check. */
export const MAX_TRIP_DAYS = 60;

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Every day from start to end, inclusive. */
export function tripDays(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end && out.length <= MAX_TRIP_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The hotel you sleep at on the night of `day` (check-in on or before it, check-out after it). */
export const hotelForNight = (hotels: Hotel[], day: string) => hotels.find((h) => h.checkIn <= day && day < h.checkOut) ?? null;
/** The hotel you wake up at on `day` (you slept there the night before). */
export const hotelForMorning = (hotels: Hotel[], day: string) => hotels.find((h) => h.checkIn < day && day <= h.checkOut) ?? null;

function checkDates(start: string, end: string) {
  if (!isDay(start) || !isDay(end)) throw badRequest("trip.date_invalid");
  if (end < start) throw badRequest("trip.end_before_start");
  if (tripDays(start, end).length > MAX_TRIP_DAYS) throw badRequest("trip.too_long");
}

/** Trips are personal, like routes: only their owner sees them, and they must still be in the group. */
export async function ownTrip(db: Db, tripId: string, userId: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip || trip.userId !== userId) throw notFound("trip.not_found");
  await requireMember(db, trip.groupId, userId);
  return trip;
}

const hotelsOf = (db: Db, tripId: string) => db.select().from(tripHotels).where(eq(tripHotels.tripId, tripId)).orderBy(asc(tripHotels.checkIn));

/** Makes a day route for each day of the trip that has none yet. */
async function fillDays(db: Db, trip: Trip) {
  const have = new Set(
    (await db.select({ date: plans.date }).from(plans).where(eq(plans.tripId, trip.id))).map((p) => p.date),
  );
  const missing = tripDays(trip.startDate, trip.endDate).filter((d) => !have.has(d));
  if (missing.length)
    await db.insert(plans).values(missing.map((date) => ({ groupId: trip.groupId, userId: trip.userId, tripId: trip.id, title: "", date })));
}

export async function createTrip(
  db: Db,
  groupId: string,
  userId: string,
  t: { title?: string; startDate: string; endDate: string; transport?: Transport; rentalCar?: boolean },
) {
  await requireMember(db, groupId, userId);
  checkDates(t.startDate, t.endDate);
  const transport = t.transport ?? "car";
  const [trip] = await db
    .insert(trips)
    .values({
      groupId,
      userId,
      title: (t.title ?? "").trim(),
      startDate: t.startDate,
      endDate: t.endDate,
      transport,
      rentalCar: transport === "car" ? false : !!t.rentalCar,
    })
    .returning();
  await fillDays(db, trip);
  return getTrip(db, trip.id, userId);
}

export async function listTrips(db: Db, groupId: string, userId: string) {
  await requireMember(db, groupId, userId);
  const rows = await db
    .select()
    .from(trips)
    .where(and(eq(trips.groupId, groupId), eq(trips.userId, userId)))
    .orderBy(desc(trips.startDate), desc(trips.createdAt));
  if (!rows.length) return [];
  const hotels = await db.select().from(tripHotels).where(inArray(tripHotels.tripId, rows.map((r) => r.id))).orderBy(asc(tripHotels.checkIn));
  return rows.map((t) => ({ ...t, hotels: hotels.filter((h) => h.tripId === t.id).map((h) => h.name) }));
}

/** The trip with its hotels and one entry per day: that day's route, and the hotel you end it at. */
export async function getTrip(db: Db, tripId: string, userId: string) {
  const trip = await ownTrip(db, tripId, userId);
  const hotels = await hotelsOf(db, tripId);
  const dayPlans = await db.select().from(plans).where(eq(plans.tripId, tripId)).orderBy(asc(plans.date), asc(plans.createdAt));
  const stops = dayPlans.length
    ? await db
        .select({ planId: planStops.planId, status: planStops.status })
        .from(planStops)
        .where(inArray(planStops.planId, dayPlans.map((p) => p.id)))
    : [];
  const days = dayPlans.map((p) => {
    const mine = stops.filter((s) => s.planId === p.id);
    const night = p.date ? hotelForNight(hotels, p.date) : null;
    return {
      planId: p.id,
      date: p.date,
      title: p.title,
      total: mine.length,
      finished: mine.filter((s) => s.status === "done" || s.status === "skipped").length,
      hotel: night ? { id: night.id, name: night.name } : null,
    };
  });
  return { ...trip, hotels, days };
}

/**
 * Rename, change the dates (day routes are added for new days; days now outside the trip are removed
 * when empty, or kept as ordinary routes when they have places), or how you're getting there.
 */
export async function updateTrip(
  db: Db,
  tripId: string,
  userId: string,
  edit: { title?: string; startDate?: string; endDate?: string; transport?: Transport; rentalCar?: boolean },
) {
  const trip = await ownTrip(db, tripId, userId);
  const startDate = edit.startDate ?? trip.startDate;
  const endDate = edit.endDate ?? trip.endDate;
  checkDates(startDate, endDate);
  const transport = edit.transport ?? trip.transport;
  const set: Partial<typeof trips.$inferInsert> = { startDate, endDate, transport };
  if (edit.title !== undefined) set.title = edit.title.trim();
  set.rentalCar = transport === "car" ? false : (edit.rentalCar ?? trip.rentalCar);
  const [next] = await db.update(trips).set(set).where(eq(trips.id, tripId)).returning();

  if (startDate !== trip.startDate || endDate !== trip.endDate) {
    const days = await db.select({ id: plans.id, date: plans.date }).from(plans).where(eq(plans.tripId, tripId));
    const outside = days.filter((p) => !p.date || p.date < startDate || p.date > endDate);
    if (outside.length) {
      const used = new Set(
        (await db.select({ planId: planStops.planId }).from(planStops).where(inArray(planStops.planId, outside.map((p) => p.id)))).map(
          (s) => s.planId,
        ),
      );
      const drop = outside.filter((p) => !used.has(p.id)).map((p) => p.id);
      const keep = outside.filter((p) => used.has(p.id)).map((p) => p.id);
      if (drop.length) await db.delete(plans).where(inArray(plans.id, drop));
      if (keep.length) await db.update(plans).set({ tripId: null }).where(inArray(plans.id, keep));
    }
    // Hotel stays are clipped to the new dates; a stay left with no night is removed.
    for (const h of await hotelsOf(db, tripId)) {
      const checkIn = h.checkIn < startDate ? startDate : h.checkIn;
      const checkOut = h.checkOut > endDate ? endDate : h.checkOut;
      if (checkIn >= checkOut) await db.delete(tripHotels).where(eq(tripHotels.id, h.id));
      else if (checkIn !== h.checkIn || checkOut !== h.checkOut) await db.update(tripHotels).set({ checkIn, checkOut }).where(eq(tripHotels.id, h.id));
    }
    await fillDays(db, next);
  }
  return getTrip(db, tripId, userId);
}

export async function deleteTrip(db: Db, tripId: string, userId: string) {
  await ownTrip(db, tripId, userId);
  await db.delete(trips).where(eq(trips.id, tripId));
}

/** A stay must sit inside the trip (check-out on the last day at the latest) and not overlap another stay. */
async function checkStay(db: Db, trip: Trip, checkIn: string, checkOut: string, hotelId?: string) {
  if (!isDay(checkIn) || !isDay(checkOut)) throw badRequest("trip.date_invalid");
  if (checkOut <= checkIn) throw badRequest("trip.hotel_no_nights");
  if (checkIn < trip.startDate || checkOut > trip.endDate) throw badRequest("trip.hotel_outside_trip");
  const others = (await hotelsOf(db, trip.id)).filter((h) => h.id !== hotelId);
  if (others.some((h) => h.checkIn < checkOut && checkIn < h.checkOut)) throw badRequest("trip.hotel_overlap");
}

export async function addHotel(db: Db, tripId: string, userId: string, f: HotelFields & { name: string; checkIn: string; checkOut: string }) {
  const trip = await ownTrip(db, tripId, userId);
  if (!f.name.trim()) throw badRequest("trip.hotel_name_required");
  await checkStay(db, trip, f.checkIn, f.checkOut);
  await db.insert(tripHotels).values({ ...f, name: f.name.trim(), tripId });
  return getTrip(db, tripId, userId);
}

async function ownHotel(db: Db, hotelId: string, userId: string) {
  const [hotel] = await db.select().from(tripHotels).where(eq(tripHotels.id, hotelId));
  if (!hotel) throw notFound("trip.hotel_not_found");
  return { hotel, trip: await ownTrip(db, hotel.tripId, userId) };
}

export async function updateHotel(db: Db, hotelId: string, userId: string, f: HotelFields) {
  const { hotel, trip } = await ownHotel(db, hotelId, userId);
  const checkIn = f.checkIn ?? hotel.checkIn;
  const checkOut = f.checkOut ?? hotel.checkOut;
  await checkStay(db, trip, checkIn, checkOut, hotel.id);
  if (f.name !== undefined && !f.name.trim()) throw badRequest("trip.hotel_name_required");
  await db
    .update(tripHotels)
    .set({ ...f, ...(f.name !== undefined ? { name: f.name.trim() } : {}) })
    .where(eq(tripHotels.id, hotelId));
  return getTrip(db, trip.id, userId);
}

export async function deleteHotel(db: Db, hotelId: string, userId: string) {
  const { trip } = await ownHotel(db, hotelId, userId);
  await db.delete(tripHotels).where(eq(tripHotels.id, hotelId));
  return getTrip(db, trip.id, userId);
}

/** For a trip day's route: the trip, where you wake up, and the hotel the day ends at (fixed last stop). */
export async function tripDay(db: Db, tripId: string, day: string | null) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip) return null;
  const hotels = await hotelsOf(db, tripId);
  const pick = (h: Hotel | null) =>
    h && { id: h.id, name: h.name, address: h.address, lat: h.lat, lng: h.lng, googlePlaceId: h.googlePlaceId, mapsUrl: h.mapsUrl };
  return {
    trip: { id: trip.id, title: trip.title, startDate: trip.startDate, endDate: trip.endDate, transport: trip.transport, rentalCar: trip.rentalCar },
    startHotel: day ? pick(hotelForMorning(hotels, day)) : null,
    endHotel: day ? pick(hotelForNight(hotels, day)) : null,
  };
}
