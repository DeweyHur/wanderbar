import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import { addMade, createDish, getDish, listDishes } from "@/lib/dishes";
import { acceptInvite, createGroup, createInvite } from "@/lib/groups";
import { addPhoto, deletePhoto, listPhotos, photoFile } from "@/lib/photos";
import { memoryStore } from "@/lib/photoStore";
import { addMenu, createRestaurant, deleteRestaurant, getRestaurant, listRestaurants } from "@/lib/restaurants";
import { profile, testDb } from "./db";

let db: Db;
let me: string;
let friend: string;
let outsider: string;
let groupId: string;
const status = (p: Promise<unknown>) => p.then(() => 200, (e) => e.status as number);
const jpeg = (n = 10) => ({ body: new Uint8Array(n).fill(7), contentType: "image/jpeg" });
const bytesOf = async (b: ReadableStream<Uint8Array> | Uint8Array) => (b instanceof Uint8Array ? b : new Uint8Array(await new Response(b).arrayBuffer()));

beforeEach(async () => {
  db = await testDb();
  me = (await signIn(db, profile("me"))).user.id;
  friend = (await signIn(db, profile("friend"))).user.id;
  outsider = (await signIn(db, profile("outsider"))).user.id;
  groupId = (await createGroup(db, me, { name: "g", timezone: "America/Los_Angeles" })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, friend);
});

describe("photos", () => {
  it("uploads to the store, serves only to members, lists menu photos under the restaurant, covers the list", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "R" });
    const [menu] = (await addMenu(db, r.id, me, { name: "Tonkotsu" })).menus;
    const a = await addPhoto(db, r.id, me, { ...jpeg(), width: 1600, height: 1200 });
    const b = await addPhoto(db, menu.id, friend, jpeg(20));
    expect(a).toMatchObject({ itemId: r.id, name: "me", width: 1600, url: `/api/photos/${a.id}` });
    const list = await listPhotos(db, r.id, friend);
    expect(list.map((p) => [p.id, p.itemName])).toEqual([
      [b.id, "Tonkotsu"],
      [a.id, null],
    ]);
    expect((await listPhotos(db, menu.id, me)).map((p) => p.id)).toEqual([b.id]);
    const f = await photoFile(db, a.id, friend);
    expect(f.contentType).toBe("image/jpeg");
    expect((await bytesOf(f.body)).byteLength).toBe(10);
    expect(await status(photoFile(db, a.id, outsider))).toBe(404);
    expect(await status(listPhotos(db, r.id, outsider))).toBe(404);
    expect(await status(addPhoto(db, r.id, outsider, jpeg()))).toBe(404);
    expect((await listRestaurants(db, groupId, me))[0].coverPhotoId).toBe(b.id);
    expect((await getRestaurant(db, r.id, me)).coverPhotoId).toBe(b.id);
  });

  it("rejects non-images and big files", async () => {
    const d = await createDish(db, groupId, me, { name: "d" });
    expect(await status(addPhoto(db, d.id, me, { body: new Uint8Array(5), contentType: "image/gif" }))).toBe(400);
    expect(await status(addPhoto(db, d.id, me, { body: new Uint8Array(5), contentType: "text/html" }))).toBe(400);
    expect(await status(addPhoto(db, d.id, me, jpeg(4 * 1024 * 1024 + 1)))).toBe(400);
    expect(await status(addPhoto(db, d.id, me, jpeg(0)))).toBe(400);
  });

  it("the camera time records the visit (restaurant or its menu) or 'made it' (dish), once per day", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, me, { name: "R" });
    const [menu] = (await addMenu(db, r.id, me, { name: "m" })).menus;
    const t = new Date("2026-10-10T19:30:00Z");
    await addPhoto(db, menu.id, me, { ...jpeg(), takenAt: t });
    await addPhoto(db, r.id, me, { ...jpeg(), takenAt: new Date("2026-10-10T21:00:00Z") });
    await addPhoto(db, r.id, me, jpeg());
    const visits = (await getRestaurant(db, r.id, me)).visits;
    expect(visits.map((v) => new Date(v.visitedAt).toISOString())).toEqual([t.toISOString()]);

    const d = await createDish(db, groupId, friend, { name: "김치찌개" });
    await addMade(db, d.id, friend, new Date("2026-10-01T02:00:00Z"));
    await addPhoto(db, d.id, friend, { ...jpeg(), takenAt: new Date("2026-10-01T03:00:00Z") }); // same LA day
    await addPhoto(db, d.id, friend, { ...jpeg(), takenAt: new Date("2026-10-03T03:00:00Z") });
    expect((await getDish(db, d.id, friend)).made).toHaveLength(2);
    expect((await listDishes(db, groupId, me))[0].coverPhotoId).not.toBeNull();
  });

  it("uploader or owner deletes; files go with the photo or its restaurant", async () => {
    const { restaurant: r } = await createRestaurant(db, groupId, friend, { name: "R" });
    const [menu] = (await addMenu(db, r.id, me, { name: "m" })).menus;
    const p1 = await addPhoto(db, r.id, friend, jpeg());
    const p2 = await addPhoto(db, menu.id, friend, jpeg());
    const p3 = await addPhoto(db, r.id, me, jpeg());
    expect(await status(deletePhoto(db, p3.id, friend))).toBe(403);
    expect(await status(deletePhoto(db, p1.id, me))).toBe(200); // owner
    expect(await status(photoFile(db, p1.id, friend))).toBe(404);
    const before = await memoryStore.get(`groups/${groupId}/${menu.id}/${p2.id}.jpg`);
    expect(before).not.toBeNull();
    await deleteRestaurant(db, r.id, friend);
    expect(await memoryStore.get(`groups/${groupId}/${menu.id}/${p2.id}.jpg`)).toBeNull();
    expect(await memoryStore.get(`groups/${groupId}/${r.id}/${p3.id}.jpg`)).toBeNull();
  });
});
