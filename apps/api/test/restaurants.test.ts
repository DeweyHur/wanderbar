import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import type { Fetch } from "@/lib/google";
import { acceptInvite, createGroup, createInvite } from "@/lib/groups";
import { addStops, applyFlow, createPlan, getPlan } from "@/lib/plans";
import { planStops } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  addMenu,
  createRestaurant,
  deleteMenu,
  deleteRestaurant,
  addVisit,
  deleteVisit,
  getMenu,
  getRestaurant,
  isFoodPlace,
  restaurantPhotoUrl,
  linkGoogle,
  listRestaurants,
  rateMenu,
  unrateMenu,
  updateMenu,
  updateRestaurant,
} from "@/lib/restaurants";
import { resolveShortLink } from "@/lib/shortLinks";
import { profile, testDb } from "./db";

let db: Db;
let me: string;
let friend: string;
let outsider: string;
let groupId: string;

const status = (p: Promise<unknown>) => p.then(() => 200, (e) => e.status as number);

/** Canned Google answers (same switch the end-to-end tests use). */
const fakeGoogle = (on: boolean) => {
  if (on) {
    process.env.E2E_FAKE_GOOGLE = "1";
    process.env.DATABASE_URL = "pglite:memory";
  } else {
    delete process.env.E2E_FAKE_GOOGLE;
    delete process.env.DATABASE_URL;
  }
};

beforeEach(async () => {
  db = await testDb();
  me = (await signIn(db, profile("me"))).user.id;
  friend = (await signIn(db, profile("friend"))).user.id;
  outsider = (await signIn(db, profile("outsider"))).user.id;
  groupId = (await createGroup(db, me, { name: "맛집", currency: "KRW" })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, friend);
});
afterEach(() => fakeGoogle(false));

describe("restaurants without Google", () => {
  it("saves a typed restaurant with category and lists it for the group only", async () => {
    const { restaurant, created } = await createRestaurant(db, groupId, me, { name: " 을지면옥 ", address: "서울 중구", category: "korean" });
    expect(created).toBe(true);
    expect(restaurant).toMatchObject({ name: "을지면옥", address: "서울 중구", category: "korean", currency: "KRW", menus: [], hoursRaw: "" });
    expect((await listRestaurants(db, groupId, friend)).map((r) => r.name)).toEqual(["을지면옥"]);
    expect(await status(listRestaurants(db, groupId, outsider))).toBe(404);
    expect(await status(getRestaurant(db, restaurant.id, outsider))).toBe(404);
  });

  it("rejects a missing name and unknown categories", async () => {
    expect(await status(createRestaurant(db, groupId, me, { name: " " }))).toBe(400);
    expect(await status(createRestaurant(db, groupId, me, { name: "x", category: "한식" }))).toBe(400);
  });

  it("the same Yelp business (any link form) is saved once; the second share adds its Google link", async () => {
    const a = await createRestaurant(db, groupId, me, { name: "Tsujita", yelpUrl: "https://www.yelp.com/biz/tsujita-la-artisan-noodle-los-angeles?utm_source=ishare" });
    expect(a.restaurant.yelpUrl).toBe("https://www.yelp.com/biz/tsujita-la-artisan-noodle-los-angeles");
    const b = await createRestaurant(db, groupId, friend, {
      name: "Tsujita LA",
      yelpUrl: "https://m.yelp.com/biz/Tsujita-LA-Artisan-Noodle-Los-Angeles",
      mapsUrl: "https://maps.app.goo.gl/x1",
    });
    expect(b.created).toBe(false);
    expect(b.restaurant.id).toBe(a.restaurant.id);
    expect(b.restaurant.mapsUrl).toBe("https://maps.app.goo.gl/x1");
    expect(await listRestaurants(db, groupId, me)).toHaveLength(1);
  });

  it("another group may save the same restaurant", async () => {
    const other = (await createGroup(db, friend, { name: "other" })).id;
    await createRestaurant(db, groupId, me, { name: "T", yelpUrl: "https://www.yelp.com/biz/t" });
    expect((await createRestaurant(db, other, friend, { name: "T", yelpUrl: "https://www.yelp.com/biz/t" })).created).toBe(true);
  });

  it("edits fields; a Yelp link already used by another restaurant is a 409", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "A", yelpUrl: "https://www.yelp.com/biz/a" });
    const { restaurant: s } = await createRestaurant(db, groupId, me, { name: "B" });
    const edited = await updateRestaurant(db, s.id, friend, { name: "B2", hoursRaw: "Mon-Fri 11-22", category: "cafe", memo: "주차 어려움" });
    expect(edited).toMatchObject({ name: "B2", hoursRaw: "Mon-Fri 11-22", category: "cafe", memo: "주차 어려움" });
    expect(await status(updateRestaurant(db, s.id, me, { yelpUrl: "https://www.yelp.com/biz/a?x=1" }))).toBe(409);
    expect(await status(updateRestaurant(db, r.id, me, { yelpUrl: "" }))).toBe(200);
    expect(await status(updateRestaurant(db, s.id, me, { yelpUrl: "https://www.yelp.com/biz/a" }))).toBe(200);
    expect(await status(updateRestaurant(db, s.id, me, { name: "" }))).toBe(400);
  });

  it("only whoever added it or the owner deletes it", async () => {
    const { restaurant: mine } = await createRestaurant(db, groupId, me, { name: "mine" });
    const { restaurant: theirs } = await createRestaurant(db, groupId, friend, { name: "theirs" });
    expect(await status(deleteRestaurant(db, mine.id, friend))).toBe(403);
    expect(await status(deleteRestaurant(db, theirs.id, me))).toBe(200); // owner
    expect(await status(deleteRestaurant(db, mine.id, me))).toBe(200);
    expect(await listRestaurants(db, groupId, me)).toEqual([]);
  });

  it("menus with prices in the group's currency", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "을지면옥" });
    let full = await addMenu(db, r.id, friend, { name: "물냉면", priceMinor: 16000 });
    full = await addMenu(db, r.id, me, { name: "편육" });
    expect(full.menus).toMatchObject([
      { name: "물냉면", priceMinor: 16000, currency: "KRW" },
      { name: "편육", priceMinor: null, currency: "KRW" },
    ]);
    const [cold, meat] = full.menus;
    full = await updateMenu(db, meat.id, me, { priceMinor: 30000, name: "편육 (중)" });
    expect(full.menus[1]).toMatchObject({ name: "편육 (중)", priceMinor: 30000 });
    expect(await status(updateMenu(db, cold.id, me, { priceMinor: -1 }))).toBe(400);
    expect(await status(updateMenu(db, cold.id, me, { priceMinor: 1.5 }))).toBe(400);
    expect(await status(addMenu(db, r.id, me, { name: "" }))).toBe(400);
    expect(await status(updateMenu(db, cold.id, outsider, { name: "x" }))).toBe(404);
    full = await deleteMenu(db, cold.id, me);
    expect(full.menus.map((m) => m.name)).toEqual(["편육 (중)"]);
    expect((await listRestaurants(db, groupId, me))[0].menuCount).toBe(1);
  });

  it("deleting a restaurant takes its menus with it and unlinks route stops", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "R" });
    await addMenu(db, r.id, me, { name: "m" });
    const plan = await createPlan(db, groupId, me, "p");
    await addStops(db, plan.id, me, [{ name: "R", itemId: r.id }]);
    await deleteRestaurant(db, r.id, me);
    expect((await getPlan(db, plan.id, me)).stops[0]).toMatchObject({ name: "R", itemId: null });
  });

  it("a route stop can only point at a restaurant of the route's group", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "R" });
    const other = (await createGroup(db, me, { name: "other" })).id;
    const plan = await createPlan(db, other, me, "p");
    expect(await status(addStops(db, plan.id, me, [{ name: "R", itemId: r.id }]))).toBe(404);
    const here = await createPlan(db, groupId, me, "p");
    expect((await addStops(db, here.id, me, [{ name: "R", itemId: r.id }]))[0].itemId).toBe(r.id);
  });

  it("linking Google needs the server key", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "R" });
    expect(await status(linkGoogle(db, r.id, me))).toBe(503);
  });
});

describe("menu ratings", () => {
  it("each member rates a menu once (rating again replaces it); averages roll up to the restaurant and the list", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "을지면옥" });
    let full = await addMenu(db, r.id, me, { name: "물냉면", priceMinor: 16000 });
    full = await addMenu(db, r.id, me, { name: "편육" });
    const [cold, meat] = full.menus;

    await rateMenu(db, cold.id, me, { stars: 4.5, review: "육수가 진하다" });
    await rateMenu(db, cold.id, friend, { stars: 3 });
    let m = await rateMenu(db, cold.id, me, { stars: 5, review: " 다시 와서 먹어도 최고 " });
    expect(m.rating).toEqual({ avg: 4, count: 2 });
    expect(m.mine).toEqual({ stars: 5, review: "다시 와서 먹어도 최고" });
    expect(m.ratings.map((x) => [x.name, x.stars])).toEqual([
      ["me", 5],
      ["friend", 3],
    ]);
    expect(m.restaurant).toEqual({ id: r.id, name: "을지면옥" });

    await rateMenu(db, meat.id, friend, { stars: 2.5 });
    const detail = await getRestaurant(db, r.id, friend);
    expect(detail.menus.map((x) => [x.name, x.rating.avg, x.rating.count, x.myStars])).toEqual([
      ["물냉면", 4, 2, 3],
      ["편육", 2.5, 1, 2.5],
    ]);
    expect(detail.rating).toEqual({ avg: 3.5, count: 3 });
    expect((await listRestaurants(db, groupId, me))[0].rating).toEqual({ avg: 3.5, count: 3 });

    m = await unrateMenu(db, cold.id, me);
    expect(m.mine).toBeNull();
    expect(m.rating).toEqual({ avg: 3, count: 1 });
  });

  it("stars must be 0.5..5 in halves; outsiders can't see or rate", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "R" });
    const [menu] = (await addMenu(db, r.id, me, { name: "m" })).menus;
    for (const stars of [0, 0.3, 5.5, -1]) expect(await status(rateMenu(db, menu.id, me, { stars }))).toBe(400);
    expect(await status(rateMenu(db, menu.id, me, { stars: 0.5 }))).toBe(200);
    expect(await status(rateMenu(db, menu.id, outsider, { stars: 5 }))).toBe(404);
    expect(await status(getMenu(db, menu.id, outsider))).toBe(404);
    expect((await listRestaurants(db, groupId, me))[0].rating).toEqual({ avg: 0.5, count: 1 });
  });

  it("deleting a menu deletes its ratings", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "R" });
    const [menu] = (await addMenu(db, r.id, me, { name: "m" })).menus;
    await rateMenu(db, menu.id, me, { stars: 4 });
    await deleteMenu(db, menu.id, me);
    expect((await getRestaurant(db, r.id, me)).rating).toEqual({ avg: null, count: 0 });
  });
});

describe("restaurants with Google (canned)", () => {
  beforeEach(() => fakeGoogle(true));

  it("a Yelp share links Google by name: hours, coordinates, Maps link and a category guess", async () => {
    const { restaurant } = await createRestaurant(db, groupId, me, { name: "Mensho Tokyo", yelpUrl: "https://yelp.to/mensho" });
    expect(restaurant).toMatchObject({
      name: "Mensho Tokyo",
      address: "672 Geary St, San Francisco, CA 94102",
      hoursRaw: "Mon-Sun 11:30-22:00",
      category: "japanese",
      googlePlaceId: "fake-mensho",
      yelpUrl: "https://www.yelp.com/biz/mensho-tokyo-san-francisco",
      mapsUrl: "https://maps.google.com/?cid=4",
      lat: 37.7866,
    });
  });

  it("a Google Maps share of a place saved from Yelp lands on the same restaurant", async () => {
    const a = await createRestaurant(db, groupId, me, { name: "Mensho Tokyo", yelpUrl: "https://yelp.to/mensho" });
    const b = await createRestaurant(db, groupId, friend, { name: "Mensho Tokyo", address: "672 Geary St", mapsUrl: "https://maps.app.goo.gl/mensho" });
    expect(b.created).toBe(false);
    expect(b.restaurant.id).toBe(a.restaurant.id);
  });

  it("a picked Google place fills the name; the same pick twice is one restaurant", async () => {
    const a = await createRestaurant(db, groupId, me, { googlePlaceId: "fake-blue-bottle" });
    expect(a.restaurant).toMatchObject({ name: "Blue Bottle Coffee", category: "cafe", hoursRaw: "24h", address: "315 Linden St, San Francisco, CA 94102" });
    expect((await createRestaurant(db, groupId, me, { googlePlaceId: "fake-blue-bottle" })).created).toBe(false);
  });

  it("two different Yelp businesses that search to one Google place stay apart (chains)", async () => {
    const a = await createRestaurant(db, groupId, me, { name: "Mensho Tokyo", yelpUrl: "https://www.yelp.com/biz/mensho-tokyo-sf" });
    const b = await createRestaurant(db, groupId, me, { name: "Mensho Tokyo", yelpUrl: "https://www.yelp.com/biz/mensho-tokyo-oakland" });
    expect(b.created).toBe(true);
    expect(b.restaurant.id).not.toBe(a.restaurant.id);
    expect(b.restaurant.googlePlaceId).toBe("");
  });

  it("an explicit category beats the guess; nothing found on Google still saves", async () => {
    expect((await createRestaurant(db, groupId, me, { name: "Mensho Tokyo", category: "bar" })).restaurant.category).toBe("bar");
    expect((await createRestaurant(db, groupId, me, { name: "동네 분식" })).restaurant).toMatchObject({ googlePlaceId: "", hoursRaw: "" });
  });

  it("relinks to Google later, keeping the typed name and address", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "멘쇼", address: "Geary St" });
    expect(r.googlePlaceId).toBe("");
    expect(await status(linkGoogle(db, r.id, me))).toBe(404); // "멘쇼" finds nothing
    const linked = await linkGoogle(db, r.id, me, "fake-mensho");
    expect(linked).toMatchObject({ name: "멘쇼", address: "Geary St", hoursRaw: "Mon-Sun 11:30-22:00", googlePlaceId: "fake-mensho", category: "japanese" });
    const { restaurant: other } = await createRestaurant(db, groupId, me, { name: "dup" });
    expect(await status(linkGoogle(db, other.id, me, "fake-mensho"))).toBe(409);
  });
});

describe("short links", () => {
  const redirects =
    (map: Record<string, string>): Fetch =>
    (async (url: string) =>
      map[url] ? new Response(null, { status: 302, headers: { location: map[url] } }) : new Response("ok", { status: 200 })) as unknown as Fetch;

  it("follows yelp.to and maps.app.goo.gl to the canonical address", async () => {
    expect(await resolveShortLink("https://yelp.to/abc", redirects({ "https://yelp.to/abc": "https://www.yelp.com/biz/x?utm=1" }))).toBe("https://www.yelp.com/biz/x?utm=1");
    expect(
      await resolveShortLink(
        "https://maps.app.goo.gl/q",
        redirects({ "https://maps.app.goo.gl/q": "https://www.google.com/maps/place/X/@1.5,2.5,17z" }),
      ),
    ).toBe("https://www.google.com/maps/place/X/@1.5,2.5,17z");
  });

  it("never fetches other hosts or ordinary links", async () => {
    const seen: string[] = [];
    const f = (async (url: string) => {
      seen.push(url);
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
    }) as unknown as Fetch;
    expect(await resolveShortLink("https://yelp.to/abc", f)).toBe("http://169.254.169.254/latest");
    expect(seen).toEqual(["https://yelp.to/abc"]);
    expect(await resolveShortLink("https://example.com/x", f)).toBe("https://example.com/x");
    expect(seen).toHaveLength(1);
  });
});

describe("route stops become restaurants; visits", () => {
  beforeEach(() => fakeGoogle(true));

  it("a Google-picked restaurant or a Yelp share in a route is filed under restaurants; a park or typed name isn't", async () => {
    const plan = await createPlan(db, groupId, me, "p");
    const stops = await addStops(db, plan.id, me, [
      { name: "Blue Bottle Coffee", googlePlaceId: "fake-blue-bottle", address: "315 Linden St" },
      { name: "Golden Gate Park", googlePlaceId: "fake-ggp" },
      { name: "카페" },
      { name: "Mensho Tokyo", yelpUrl: "https://yelp.to/mensho" },
    ]);
    const list = await listRestaurants(db, groupId, me);
    expect(list.map((r) => r.name).sort()).toEqual(["Blue Bottle Coffee", "Mensho Tokyo"]);
    const byName = Object.fromEntries(stops.map((x) => [x.name, x]));
    expect(byName["Blue Bottle Coffee"].itemId).toBe(list.find((r) => r.name === "Blue Bottle Coffee")!.id);
    expect(byName["Golden Gate Park"]).toMatchObject({ itemId: null, placeKind: "other" });
    expect(byName["카페"]).toMatchObject({ itemId: null, placeKind: "other" });
    // Adding the same place again (another route) points at the same restaurant.
    const plan2 = await createPlan(db, groupId, me, "p2");
    const [again] = await addStops(db, plan2.id, me, [{ name: "Blue Bottle", googlePlaceId: "fake-blue-bottle" }]);
    expect(again.itemId).toBe(byName["Blue Bottle Coffee"].itemId);
    expect(await listRestaurants(db, groupId, me)).toHaveLength(2);
  });

  it("older stops are filed when the route is opened", async () => {
    const plan = await createPlan(db, groupId, me, "p");
    const [s] = await addStops(db, plan.id, me, [{ name: "x" }]);
    // An old stop saved before this feature: Google place, not checked yet.
    await db.update(planStops).set({ name: "Mensho Tokyo", googlePlaceId: "fake-mensho", placeKind: null }).where(eq(planStops.id, s.id));
    const opened = await getPlan(db, plan.id, me);
    expect(opened.stops[0].itemId).not.toBeNull();
    expect((await getRestaurant(db, opened.stops[0].itemId!, me)).hasPhoto).toBe(true);
  });

  it("Done on a restaurant stop records a visit; bringing it back removes it; restart keeps it", async () => {
    const plan = await createPlan(db, groupId, me, "p");
    const [a, b] = await addStops(db, plan.id, me, [{ name: "Mensho Tokyo", googlePlaceId: "fake-mensho" }, { name: "park" }]);
    await applyFlow(db, plan.id, me, { action: "complete", stopId: a.id });
    await applyFlow(db, plan.id, me, { action: "complete", stopId: b.id });
    let r = await getRestaurant(db, a.itemId!, friend);
    expect(r.visits.map((v) => [v.name, v.fromRoute])).toEqual([["me", true]]);
    expect((await listRestaurants(db, groupId, me))[0].lastVisitedAt).not.toBeNull();
    await applyFlow(db, plan.id, me, { action: "restore", stopId: a.id });
    expect((await getRestaurant(db, a.itemId!, me)).visits).toEqual([]);
    await applyFlow(db, plan.id, me, { action: "complete", stopId: a.id });
    await applyFlow(db, plan.id, me, { action: "restart" });
    expect((await getRestaurant(db, a.itemId!, me)).visits).toHaveLength(1);
  });

  it("visits by hand; only your own can be deleted", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "동네 분식" });
    await addVisit(db, r.id, friend, new Date("2026-10-01T19:00:00Z"));
    const mine = await addVisit(db, r.id, me);
    expect(mine.visits.map((v) => v.name)).toEqual(["me", "friend"]);
    expect(await status(deleteVisit(db, mine.visits[1].id, me))).toBe(403);
    expect((await deleteVisit(db, mine.visits[0].id, me)).visits).toHaveLength(1);
    expect(await status(addVisit(db, r.id, me, new Date("2099-01-01")))).toBe(400);
    expect(await status(addVisit(db, r.id, outsider))).toBe(404);
  });

  it("cover photo comes from Google; a Yelp page is found for Google-picked restaurants", async () => {
    const { restaurant } = await createRestaurant(db, groupId, me, { googlePlaceId: "fake-mensho" });
    expect(restaurant.hasPhoto).toBe(true);
    expect(await restaurantPhotoUrl(db, restaurant.id, me)).toBe("/favicon.ico");
    expect(restaurant.yelpUrl).toBe("https://www.yelp.com/biz/mensho-tokyo-san-francisco");
    const { restaurant: plain } = await createRestaurant(db, groupId, me, { name: "동네 분식" });
    expect(await status(restaurantPhotoUrl(db, plain.id, me))).toBe(404);
    expect(await status(restaurantPhotoUrl(db, restaurant.id, outsider))).toBe(404);
  });

  it("knows food places from Google types", () => {
    for (const t of ["restaurant", "korean_restaurant", "cafe", "coffee_shop", "bar", "bakery", "fast_food_restaurant", "ice_cream_shop", "steak_house"]) expect(isFoodPlace(t)).toBe(true);
    for (const t of ["park", "museum", "tourist_attraction", "gas_station", "", null]) expect(isFoodPlace(t)).toBe(false);
  });
});
