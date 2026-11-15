import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import { acceptInvite, createGroup, createInvite } from "@/lib/groups";
import { addPhoto, listPhotos } from "@/lib/photos";
import { pushPath, pushText } from "@/lib/push";
import { createProperty, createTour, deleteProperty, deleteTour, getProperty, listProperties, NewPropertyBody, TourBody, updateProperty, updateTour } from "@/lib/realestate";
import { profile, testDb } from "./db";

let db: Db;
let me: string;
let partner: string;
let outsider: string;
let groupId: string;
const status = (p: Promise<unknown>) => p.then(() => 200, (e) => e.status as number);
const ZILLOW = "https://www.zillow.com/homedetails/1234-W-Main-St-Torrance-CA-90501/12345678_zpid/";
const REDFIN = "https://www.redfin.com/CA/Torrance/1234-W-Main-St-90501/home/555";
const NOW = new Date("2026-11-15T21:00:00Z"); // Sunday 1pm in Los Angeles

beforeEach(async () => {
  db = await testDb();
  me = (await signIn(db, profile("me"))).user.id;
  partner = (await signIn(db, profile("partner"))).user.id;
  outsider = (await signIn(db, profile("outsider"))).user.id;
  groupId = (await createGroup(db, me, { name: "House hunt", module: "realestate", timezone: "America/Los_Angeles" })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, partner);
});

describe("houses", () => {
  it("saves from a listing link (address read from the URL), and the same house from another site joins it", async () => {
    const a = await createProperty(db, groupId, me, NewPropertyBody.parse({ url: `Check out this home on Zillow ${ZILLOW}?utm=x`, price: 950000, beds: 3, baths: 2, sqft: 1400 }));
    expect(a.created).toBe(true);
    expect(a.property).toMatchObject({ address: "1234 W Main St, Torrance, CA 90501", city: "Torrance", zip: "90501", price: 950000, stage: "interested" });
    expect(a.property.links).toEqual([expect.objectContaining({ kind: "zillow", url: ZILLOW })]);

    const b = await createProperty(db, groupId, partner, { url: REDFIN });
    expect(b.created).toBe(false);
    expect(b.property.id).toBe(a.property.id);
    expect(b.property.links.map((l) => l.kind)).toEqual(["zillow", "redfin"]);

    const c = await createProperty(db, groupId, me, { address: "1234 West Main Street, Torrance, CA 90501, USA" });
    expect(c.created).toBe(false);
    expect(await listProperties(db, groupId, partner)).toHaveLength(1);
  });

  it("typed address; unreadable links and empty input are refused; outsiders see nothing", async () => {
    const { property } = await createProperty(db, groupId, me, { address: "4100 Duquesne Ave, Culver City, CA 90232", stage: "to_tour", openHouse: "Sun 1–4pm" });
    expect(property).toMatchObject({ city: "Culver City", zip: "90232", stage: "to_tour", openHouse: "Sun 1–4pm" });
    expect(await status(createProperty(db, groupId, me, { url: "https://www.zillow.com/torrance-ca/" }))).toBe(400);
    expect(await status(createProperty(db, groupId, me, {}))).toBe(400);
    expect(await status(createProperty(db, groupId, outsider, { address: "x" }))).toBe(404);
    expect(await status(getProperty(db, property.id, outsider))).toBe(404);
    expect(await status(listProperties(db, groupId, outsider))).toBe(404);
  });

  it("edits facts, stage and links; moving onto another house's address is a duplicate; delete is creator or owner", async () => {
    const { property: p } = await createProperty(db, groupId, partner, { address: "13915 Cerise Ave, Hawthorne, CA 90250" });
    const { property: q } = await createProperty(db, groupId, partner, { address: "15520 Larch Ave, Lawndale, CA 90260" });
    const edited = await updateProperty(db, p.id, me, { price: 899000, hoaMonthly: 0, stage: "rejected", rejectReason: "freeway noise", url: REDFIN, memo: "corner lot" });
    expect(edited).toMatchObject({ price: 899000, stage: "rejected", rejectReason: "freeway noise", memo: "corner lot" });
    expect(edited.links.map((l) => l.kind)).toEqual(["redfin"]);
    expect(await status(updateProperty(db, q.id, me, { address: "13915 Cerise Avenue, Hawthorne, CA 90250" }))).toBe(409);
    expect(await status(updateProperty(db, p.id, me, { url: "https://example.com" }))).toBe(400);
    expect(await status(deleteProperty(db, p.id, outsider))).toBe(404);
    // me is the group's owner: may delete partner's house.
    expect(await status(deleteProperty(db, p.id, me))).toBe(200);
    expect(await status(deleteProperty(db, q.id, me))).toBe(200);
    expect(await listProperties(db, groupId, me)).toEqual([]);
  });
  it("a member who didn't save it and isn't the owner can't delete it", async () => {
    const { property } = await createProperty(db, groupId, me, { address: "1 A St, Carson, CA 90745" });
    expect(await status(deleteProperty(db, property.id, partner))).toBe(403);
  });
});

describe("tours", () => {
  it("each member records their own visit; the house moves to toured; the list sums it up", async () => {
    const { property } = await createProperty(db, groupId, me, { url: ZILLOW, stage: "to_tour" });
    const mine = await createTour(db, property.id, me, {}, NOW);
    expect(mine).toMatchObject({ visitedOn: "2026-11-15", overall: null, mine: true, address: property.address });
    expect((await getProperty(db, property.id, me)).stage).toBe("toured");

    const saved = await updateTour(
      db,
      mine.id,
      me,
      TourBody.parse({ overall: 8, quick: "again", scores: { light: 5, noise: 2 }, checks: { ac: true, roofWorry: false }, roomNotes: { kitchen: "north window, dark" }, pros: "big yard", cons: "near 405", agent: "Jane 310-555-0100", heard: "offers due Tue" }),
    );
    expect(saved).toMatchObject({ overall: 8, quick: "again", scores: { light: 5, noise: 2 }, checks: { ac: true, roofWorry: false }, roomNotes: { kitchen: "north window, dark" }, pros: "big yard" });
    // null clears one score
    expect((await updateTour(db, mine.id, me, TourBody.parse({ scores: { light: 5, noise: null } }))).scores).toEqual({ light: 5 });

    const theirs = await createTour(db, property.id, partner, { overall: 6, visitedOn: "2026-11-14" }, NOW);
    expect(await status(updateTour(db, theirs.id, me, { overall: 1 }))).toBe(403);
    expect(await status(deleteTour(db, theirs.id, me))).toBe(403);
    expect(await status(updateTour(db, mine.id, outsider, { overall: 1 }))).toBe(404);

    const detail = await getProperty(db, property.id, partner);
    expect(detail.tours.map((t) => [t.name, t.visitedOn, t.overall, t.mine])).toEqual([
      ["me", "2026-11-15", 8, false],
      ["partner", "2026-11-14", 6, true],
    ]);
    const [row] = await listProperties(db, groupId, me);
    expect(row).toMatchObject({ tours: 2, avgOverall: 7, myOverall: 8, myQuick: "again", lastVisited: "2026-11-15" });
  });

  it("refuses bad scores and future dates", async () => {
    const { property } = await createProperty(db, groupId, me, { url: ZILLOW });
    expect(() => TourBody.parse({ overall: 11 })).toThrow();
    expect(() => TourBody.parse({ scores: { light: 6 } })).toThrow();
    expect(() => TourBody.parse({ scores: { nope: 3 } })).toThrow();
    expect(await status(createTour(db, property.id, me, { visitedOn: "2026-12-01" }, NOW))).toBe(400);
  });

  it("photos carry the room and the tour; deleting the tour keeps the photos; photo time doesn't add a restaurant visit", async () => {
    const { property } = await createProperty(db, groupId, me, { url: ZILLOW });
    const tour = await createTour(db, property.id, me, {}, NOW);
    const jpeg = { body: new Uint8Array(10).fill(1), contentType: "image/jpeg", takenAt: NOW };
    const p = await addPhoto(db, property.id, me, { ...jpeg, room: "kitchen", tourId: tour.id });
    expect(p).toMatchObject({ room: "kitchen", tourId: tour.id });
    expect((await addPhoto(db, property.id, me, { ...jpeg, room: "spaceship" })).room).toBeNull();
    const { property: other } = await createProperty(db, groupId, me, { address: "1 B St, Carson, CA 90745" });
    expect(await status(addPhoto(db, other.id, me, { ...jpeg, tourId: tour.id }))).toBe(400);
    await deleteTour(db, tour.id, me);
    expect((await listPhotos(db, property.id, partner)).map((x) => [x.room, x.tourId])).toEqual(
      expect.arrayContaining([
        [null, null],
        ["kitchen", null],
      ]),
    );
    expect((await listProperties(db, groupId, me)).find((x) => x.id === property.id)?.coverUrl).toMatch(/^\/api\/photos\/.+\?size=thumb$/);
  });
});

describe("push", () => {
  it("texts and paths", () => {
    expect(pushText("ko", { type: "property", who: "지수", name: "1 A St", itemId: "p1" })).toBe("🏠 지수님이 1 A St을(를) 담았어요");
    expect(pushText("en", { type: "tour", who: "Amy", name: "1 A St", score: 8, itemId: "p1" })).toBe("🏠 Amy toured 1 A St and gave it 8/10");
    expect(pushPath({ type: "tour", who: "Amy", name: "x", score: 8, itemId: "p1" })).toBe("/property/p1");
    expect(pushPath({ type: "photo", who: "Amy", name: "x", itemId: "p1", kind: "property" })).toBe("/property/p1");
  });
});
