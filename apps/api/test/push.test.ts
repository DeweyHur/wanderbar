import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn, setUserLocale } from "@/lib/auth";
import { addNightGame, createGame, createNight } from "@/lib/boardgame";
import { createDish, rateDish } from "@/lib/dishes";
import { acceptInvite, createGroup, createInvite } from "@/lib/groups";
import { addMeal } from "@/lib/meals";
import { addPhoto } from "@/lib/photos";
import { createPlan, updatePlan } from "@/lib/plans";
import { flushPush, registerPushToken, setPushSender, unregisterPushToken, type PushMessage } from "@/lib/push";
import { dailyPushes, upcomingDays } from "@/lib/reminders";
import { addMenu, createRestaurant, rateMenu } from "@/lib/restaurants";
import { addShopping } from "@/lib/shopping";
import { profile, testDb } from "./db";

let db: Db;
let me: string;
let friend: string;
let groupId: string;
let sent: PushMessage[];

beforeEach(async () => {
  db = await testDb();
  me = (await signIn(db, profile("me"))).user.id;
  friend = (await signIn(db, profile("friend"))).user.id;
  groupId = (await createGroup(db, me, { name: "Foodies", timezone: "America/Los_Angeles" })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, friend);
  sent = [];
  setPushSender(async (m) => {
    sent.push(m);
    return m.token === "gone-token" ? "gone" : "ok";
  });
});
afterEach(() => setPushSender(null));

const bodies = async () => {
  await flushPush();
  return sent.map((m) => `${m.token}: ${m.body}`);
};

describe("group news push", () => {
  it("tells the other members (in their language) about new restaurants, dishes, first ratings and photo batches", async () => {
    await registerPushToken(db, friend, { token: "friend-phone", platform: "android", locale: "ko" });
    await registerPushToken(db, me, { token: "my-phone", platform: "android" });
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "Ramen Ya" });
    const [menu] = (await addMenu(db, r.id, me, { name: "Tonkotsu" })).menus;
    await rateMenu(db, menu.id, me, { stars: 4.5 });
    await rateMenu(db, menu.id, me, { stars: 5 }); // changing my rating isn't news
    await addPhoto(db, r.id, me, { body: new Uint8Array(5), contentType: "image/jpeg" });
    await addPhoto(db, r.id, me, { body: new Uint8Array(5), contentType: "image/jpeg" }); // same batch
    const dish = await createDish(db, groupId, friend, { name: "Kimchi stew" });
    await rateDish(db, dish.id, friend, { stars: 3 });
    expect(await bodies()).toEqual([
      "friend-phone: 🍜 me님이 Ramen Ya을(를) 저장했어요",
      "friend-phone: ⭐ me님이 Tonkotsu에 별 4.5개",
      "friend-phone: 📷 me님이 Ramen Ya 사진을 올렸어요",
      "my-phone: 🍳 friend added Kimchi stew to home cooking",
      "my-phone: ⭐ friend gave Kimchi stew 3 stars",
    ]);
    expect(sent[0]).toMatchObject({ title: "Foodies", data: { path: `/restaurant/${r.id}`, type: "restaurant", groupId } });
    expect(sent[1].data.path).toBe(`/menu/${menu.id}`);
    // The app's language setting wins over the device's.
    await setUserLocale(db, friend, "en");
    sent = [];
    await createRestaurant(db, groupId, me, { name: "Pho Place" });
    expect(await bodies()).toEqual(["friend-phone: 🍜 me saved Pho Place"]);
  });

  it("forgets devices FCM says are gone, and devices that sign out", async () => {
    await registerPushToken(db, friend, { token: "gone-token", platform: "android" });
    await registerPushToken(db, friend, { token: "friend-phone", platform: "android" });
    await createRestaurant(db, groupId, me, { name: "A" });
    await bodies();
    sent = [];
    await unregisterPushToken(db, friend, "friend-phone");
    await createRestaurant(db, groupId, me, { name: "B" });
    expect(await bodies()).toEqual([]);
  });

  it("board game nights: a new night, a game picked, and the day before", async () => {
    const bg = (await createGroup(db, me, { name: "Dice", timezone: "America/Los_Angeles", module: "boardgame" })).id;
    await acceptInvite(db, (await createInvite(db, bg, me)).token, friend);
    await registerPushToken(db, friend, { token: "friend-phone", platform: "android" });
    const startsAt = new Date(Date.now() + 24 * 3_600_000);
    const night = await createNight(db, bg, me, { startsAt, location: "Dewey's" });
    const game = await createGame(db, bg, me, { name: "Cascadia" });
    await addNightGame(db, night.id, game.id, me);
    const [created, picked] = await bodies();
    expect(created).toMatch(/^friend-phone: 🎲 New board game night: \w{3}, \w{3} \d+, \d+:\d{2}/);
    expect(picked).toMatch(/^friend-phone: 🎲 me picked Cascadia for /);
    sent = [];
    expect(await dailyPushes(db)).toEqual({ sent: 1 });
    expect(sent[0].body).toMatch(/^🎲 Board game night tomorrow! .* · Dewey's · Cascadia$/);
    expect(sent[0].data.path).toBe(`/night/${night.id}`);
  });
});

describe("reminders the phone schedules", () => {
  it("lists my upcoming routes with stops, meals and what's still to buy", async () => {
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(Date.now() + 86_400_000));
    const home = await createPlan(db, groupId, me, "", tomorrow);
    await updatePlan(db, home.id, me, { atHome: true });
    const [meal] = await addMeal(db, home.id, me, { slot: "dinner", title: "Tacos" });
    await addShopping(db, groupId, me, { name: "tortillas, salsa", mealId: meal.id });
    await createPlan(db, groupId, me, "", "2020-01-01"); // past
    await createPlan(db, groupId, friend, "", tomorrow); // someone else's
    expect(await upcomingDays(db, me)).toEqual([
      { planId: home.id, groupId, groupName: "Foodies", date: tomorrow, title: "", atHome: true, stops: 0, firstStop: null, meals: 1, toBuy: 2 },
    ]);
  });
});
