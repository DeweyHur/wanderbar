import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import { acceptInvite, createGroup, createInvite } from "@/lib/groups";
import { addStops, applyFlow, getPlan, knownPlaces, listPlans, updatePlan } from "@/lib/plans";
import { createRestaurant } from "@/lib/restaurants";
import { addHotel, createTrip, deleteHotel, deleteTrip, getTrip, listTrips, updateHotel, updateTrip } from "@/lib/trips";
import { profile, testDb } from "./db";

let db: Db;
let me: string;
let friend: string;
let groupId: string;

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => e.code as string);
const status = (p: Promise<unknown>) => p.then(() => 200, (e) => e.status as number);

beforeEach(async () => {
  db = await testDb();
  me = (await signIn(db, profile("me"))).user.id;
  friend = (await signIn(db, profile("friend"))).user.id;
  groupId = (await createGroup(db, me, { name: "g" })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, friend);
});

const hotel = (name: string, checkIn: string, checkOut: string) => ({ name, address: `${name} St`, lat: 1, lng: 2, checkIn, checkOut });

describe("trips", () => {
  it("makes a day route per day; flying keeps the rental-car answer, driving never has one", async () => {
    const trip = await createTrip(db, groupId, me, { title: "Kyoto", startDate: "2026-12-01", endDate: "2026-12-04", transport: "flight", rentalCar: true });
    expect(trip).toMatchObject({ title: "Kyoto", transport: "flight", rentalCar: true });
    expect(trip.days.map((d) => d.date)).toEqual(["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]);
    const car = await createTrip(db, groupId, me, { startDate: "2026-12-10", endDate: "2026-12-10", transport: "car", rentalCar: true });
    expect(car.rentalCar).toBe(false);
    expect((await listTrips(db, groupId, me)).map((t) => t.id)).toEqual([car.id, trip.id]);
    // Day routes say which trip they belong to.
    expect((await listPlans(db, groupId, me)).filter((p) => p.tripId === trip.id)).toHaveLength(4);
  });

  it("rejects bad dates and over-long trips", async () => {
    expect(await code(createTrip(db, groupId, me, { startDate: "2026-12-05", endDate: "2026-12-01" }))).toBe("trip.end_before_start");
    expect(await code(createTrip(db, groupId, me, { startDate: "2026-13-01", endDate: "2026-12-01" }))).toBe("trip.date_invalid");
    expect(await code(createTrip(db, groupId, me, { startDate: "2026-01-01", endDate: "2026-06-01" }))).toBe("trip.too_long");
  });

  it("hotels are stays over a period; each night's route ends at that night's hotel", async () => {
    const trip = await createTrip(db, groupId, me, { startDate: "2026-12-01", endDate: "2026-12-05" });
    await addHotel(db, trip.id, me, hotel("Ryokan", "2026-12-01", "2026-12-03"));
    const t = await addHotel(db, trip.id, me, hotel("Tower", "2026-12-03", "2026-12-05"));
    expect(t.days.map((d) => d.hotel?.name ?? null)).toEqual(["Ryokan", "Ryokan", "Tower", "Tower", null]);

    const day3 = await getPlan(db, t.days[2].planId, me);
    expect(day3.trip?.id).toBe(trip.id);
    expect(day3.startHotel?.name).toBe("Ryokan"); // woke up there
    expect(day3.endHotel).toMatchObject({ name: "Tower", address: "Tower St", lat: 1, lng: 2 });
    const last = await getPlan(db, t.days[4].planId, me);
    expect([last.startHotel?.name, last.endHotel]).toEqual(["Tower", null]); // going home

    // Stays can't overlap, can't fall outside the trip, and need at least one night.
    expect(await code(addHotel(db, trip.id, me, hotel("X", "2026-12-02", "2026-12-04")))).toBe("trip.hotel_overlap");
    expect(await code(addHotel(db, trip.id, me, hotel("X", "2026-11-30", "2026-12-01")))).toBe("trip.hotel_outside_trip");
    expect(await code(addHotel(db, trip.id, me, hotel("X", "2026-12-05", "2026-12-05")))).toBe("trip.hotel_no_nights");

    const tower = t.hotels.find((h) => h.name === "Tower")!;
    const moved = await updateHotel(db, tower.id, me, { checkOut: "2026-12-04" });
    expect(moved.days.map((d) => d.hotel?.name ?? null)).toEqual(["Ryokan", "Ryokan", "Tower", null, null]);
    const gone = await deleteHotel(db, tower.id, me);
    expect(gone.hotels.map((h) => h.name)).toEqual(["Ryokan"]);
  });

  it("changing dates adds new days, drops empty old ones, keeps old days with places as plain routes, clips stays", async () => {
    const trip = await createTrip(db, groupId, me, { startDate: "2026-12-01", endDate: "2026-12-04" });
    await addHotel(db, trip.id, me, hotel("Inn", "2026-12-01", "2026-12-04"));
    await addStops(db, trip.days[0].planId, me, [{ name: "Temple" }]);
    const t = await updateTrip(db, trip.id, me, { startDate: "2026-12-02", endDate: "2026-12-06", transport: "train", rentalCar: true });
    expect(t.days.map((d) => d.date)).toEqual(["2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
    expect(t.hotels.map((h) => [h.checkIn, h.checkOut])).toEqual([["2026-12-02", "2026-12-04"]]);
    expect(t).toMatchObject({ transport: "train", rentalCar: true });
    const kept = await getPlan(db, trip.days[0].planId, me);
    expect([kept.tripId, kept.stops.map((s) => s.name)]).toEqual([null, ["Temple"]]);
    expect(await status(getPlan(db, trip.days[1].planId, me))).toBe(200);
    // Back to driving: no rental car.
    expect((await updateTrip(db, trip.id, me, { transport: "car" })).rentalCar).toBe(false);
  });

  it("a trip day stays on its day; deleting the trip deletes its day routes", async () => {
    const trip = await createTrip(db, groupId, me, { startDate: "2026-12-01", endDate: "2026-12-02" });
    expect(await code(updatePlan(db, trip.days[0].planId, me, { date: "2026-12-09" }))).toBe("plan.trip_day_date");
    expect(await code(updatePlan(db, trip.days[0].planId, me, { title: "Arrival" }))).toBe("ok");
    await deleteTrip(db, trip.id, me);
    expect(await status(getPlan(db, trip.days[0].planId, me))).toBe(404);
  });

  it("trips are personal", async () => {
    const trip = await createTrip(db, groupId, me, { startDate: "2026-12-01", endDate: "2026-12-02" });
    expect(await status(getTrip(db, trip.id, friend))).toBe(404);
    expect(await listTrips(db, groupId, friend)).toEqual([]);
    expect(await status(addHotel(db, trip.id, friend, hotel("X", "2026-12-01", "2026-12-02")))).toBe(404);
  });

  it("known places: route stops (been there or planned) and saved restaurants, one each", async () => {
    const trip = await createTrip(db, groupId, me, { startDate: "2026-12-01", endDate: "2026-12-02" });
    const stops = await addStops(db, trip.days[0].planId, me, [
      { name: "Temple", lat: 35.02, lng: 135.79, googlePlaceId: "g-temple" },
      { name: "Market", lat: 35.005, lng: 135.765 },
      { name: "No location" },
    ]);
    await applyFlow(db, trip.days[0].planId, me, { action: "complete", stopId: stops[0].id });
    await addStops(db, trip.days[1].planId, me, [{ name: "Temple", lat: 35.02, lng: 135.79, googlePlaceId: "g-temple" }]);
    await createRestaurant(db, groupId, me, {
      name: "Ramen",
      googlePlaceId: "g-ramen",
      prefetched: { googlePlaceId: "g-ramen", name: "Ramen", address: "1 Noodle St", lat: 35.01, lng: 135.77, mapsUrl: "", hoursRaw: "", primaryType: "ramen_restaurant", photoName: "" },
    });
    const known = await knownPlaces(db, groupId, me);
    const view = known.map((k) => [k.name, k.source]).sort((a, b) => a[0].localeCompare(b[0]));
    expect(view).toEqual([["Market", "planned"], ["Ramen", "saved"], ["Temple", "been"]]);
    // Not someone else's routes.
    expect((await knownPlaces(db, groupId, friend)).map((k) => k.name)).toEqual(["Ramen"]);
  });
});
