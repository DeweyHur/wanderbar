import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import {
  addGuest,
  addNightGame,
  boardgameHome,
  createGame,
  createNight,
  createSeries,
  deleteGame,
  deleteSeries,
  getGame,
  getNight,
  listGames,
  queueGame,
  rateGame,
  removeGuest,
  removeNightGame,
  setRsvp,
  unqueueGame,
  updateGame,
  updateNight,
  updateSeries,
} from "@/lib/boardgame";
import { acceptInvite, createGroup, createInvite } from "@/lib/groups";
import { localDate, localTime } from "@/lib/recurrence";
import { profile, testDb } from "./db";

let db: Db;
let me: string;
let amy: string;
let ben: string;
let groupId: string;
const LA = "America/Los_Angeles";
// Thursday Nov 5 2026, 2 pm in Los Angeles.
const NOW = new Date("2026-11-05T22:00:00Z");

const status = (p: Promise<unknown>) => p.then(() => 200, (e) => e.status as number);
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

beforeEach(async () => {
  db = await testDb();
  me = (await signIn(db, profile("me"))).user.id;
  amy = (await signIn(db, profile("amy"))).user.id;
  ben = (await signIn(db, profile("ben"))).user.id;
  groupId = (await createGroup(db, me, { name: "Board game night", module: "boardgame", timezone: LA })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, amy);
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, ben);
});

describe("games", () => {
  it("keeps BGG / BGA / TTS / rulebook / video links and tags", async () => {
    const g = await createGame(db, groupId, amy, {
      name: " Cascadia ",
      links: [
        { kind: "bgg", url: "https://boardgamegeek.com/boardgame/295947/cascadia" },
        { kind: "bga", url: "https://boardgamearena.com/gamepanel?game=cascadia" },
        { kind: "tts", url: "https://steamcommunity.com/sharedfiles/filedetails/?id=1" },
        { kind: "rulebook", url: "https://example.com/cascadia.pdf" },
        { kind: "video", url: "https://youtu.be/abc" },
        { kind: "other", url: "https://example.com/faq", label: "FAQ" },
        { kind: "video", url: "  " },
      ],
      tags: ["Tile laying", "family", "FAMILY"],
    });
    expect(g.name).toBe("Cascadia");
    expect(g.links.map((l) => l.kind)).toEqual(["bgg", "bga", "tts", "rulebook", "video", "other"]);
    expect(g.links.find((l) => l.kind === "other")?.label).toBe("FAQ");
    expect(g.tags).toEqual(["family", "Tile laying"]);
    expect(await status(createGame(db, groupId, amy, { name: "x", links: [{ kind: "bgg", url: "javascript:alert(1)" }] }))).toBe(400);

    const edited = await updateGame(db, g.id, me, { tags: ["Family", "Puzzle"], links: [{ kind: "bgg", url: "https://boardgamegeek.com/boardgame/295947" }] });
    expect(edited.tags).toEqual(["family", "Puzzle"]); // the existing "family" tag is reused
    expect(edited.links).toHaveLength(1);
  });

  it("rates 1..10 with a comment; one rating per member, updated later", async () => {
    const g = await createGame(db, groupId, me, { name: "Brass" });
    await rateGame(db, g.id, me, { score: 9, review: "Masterpiece" });
    await rateGame(db, g.id, amy, { score: 6 });
    let out = await rateGame(db, g.id, amy, { score: 7, review: "Grew on me" });
    expect(out.rating).toEqual({ avg: 8, count: 2 });
    expect(out.mine).toEqual({ score: 7, review: "Grew on me" });
    out = await getGame(db, g.id, me);
    expect(out.ratings.map((r) => [r.score, r.review])).toEqual([
      [7, "Grew on me"],
      [9, "Masterpiece"],
    ]);
    for (const score of [0, 11, 7.5]) expect(await status(rateGame(db, g.id, me, { score }))).toBe(400);
  });

  it("only the one who added it, the owner or a host can delete; outsiders see nothing", async () => {
    const g = await createGame(db, groupId, amy, { name: "Azul" });
    expect(await status(deleteGame(db, g.id, ben))).toBe(403);
    const stranger = (await signIn(db, profile("stranger"))).user.id;
    expect(await status(getGame(db, g.id, stranger))).toBe(404);
    expect(await status(listGames(db, groupId, stranger))).toBe(404);
    await deleteGame(db, g.id, me);
    expect(await listGames(db, groupId, me)).toEqual([]);
  });
});

describe("regular meetup", () => {
  it("creates the next night ahead, at 7 pm local, and the following one after it passes", async () => {
    const s = await createSeries(db, groupId, me, { weekday: 6, time: "19:00", location: "Ben's place" }, NOW);
    let home = await boardgameHome(db, groupId, me, NOW);
    expect(home.series).toMatchObject([{ id: s.id, weekday: 6, time: "19:00", everyWeeks: 1 }]);
    expect(home.upcoming).toHaveLength(1);
    const night = home.upcoming[0];
    expect(localDate(night.startsAt, LA)).toBe("2026-11-07");
    expect(localTime(night.startsAt, LA)).toBe("19:00");
    expect(night).toMatchObject({ location: "Ben's place", status: "upcoming", picker: null });

    // Asking again doesn't duplicate it.
    expect((await boardgameHome(db, groupId, amy, NOW)).upcoming).toHaveLength(1);

    // During the night it's "live"; the day after, it's history and next week's night exists.
    const during = new Date(night.startsAt.getTime() + 3_600_000);
    expect((await boardgameHome(db, groupId, me, during)).upcoming.map((n) => n.status)).toEqual(["live"]);
    const sunday = new Date(night.startsAt.getTime() + 18 * 3_600_000);
    home = await boardgameHome(db, groupId, me, sunday);
    expect(home.past.map((n) => n.id)).toEqual([night.id]);
    expect(home.upcoming.map((n) => localDate(n.startsAt, LA))).toEqual(["2026-11-14"]);
  });

  it("only the owner or a host sets up schedules and one-off nights", async () => {
    expect(await status(createSeries(db, groupId, amy, { weekday: 5 }, NOW))).toBe(403);
    expect(await status(createNight(db, groupId, amy, { startsAt: hours(48) }))).toBe(403);
    // A one-off night by local date and time, in the group's time zone.
    const n = await createNight(db, groupId, me, { date: "2026-11-27", time: "18:00", location: "Cafe" });
    expect(n.startsAt.toISOString()).toBe("2026-11-28T02:00:00.000Z");
    expect((await updateNight(db, n.id, me, { date: "2026-11-28", time: "13:30" })).startsAt.toISOString()).toBe("2026-11-28T21:30:00.000Z");
    expect(await status(createNight(db, groupId, me, { date: "2026-11-27" }))).toBe(400);
    expect(await status(updateNight(db, n.id, amy, { location: "x" }))).toBe(403);
    expect(await status(createSeries(db, groupId, me, { time: "25:00" }, NOW))).toBe(400);
    expect(await status(createSeries(db, groupId, me, { weekday: 7 }, NOW))).toBe(400);
    expect(await status(createSeries(db, groupId, me, { everyWeeks: 5 }, NOW))).toBe(400);
  });

  it("changing the schedule moves the upcoming night and keeps its games; stopping removes future nights", async () => {
    const s = await createSeries(db, groupId, me, { weekday: 6, time: "19:00" }, NOW);
    const [night] = (await boardgameHome(db, groupId, me, NOW)).upcoming;
    const g = await createGame(db, groupId, me, { name: "Ark Nova" });
    await addNightGame(db, night.id, g.id, me);
    await updateSeries(db, s.id, me, { weekday: 5, time: "18:30" }, NOW);
    const [moved] = (await boardgameHome(db, groupId, me, NOW)).upcoming;
    expect(moved.id).toBe(night.id);
    expect(localDate(moved.startsAt, LA)).toBe("2026-11-06");
    expect(localTime(moved.startsAt, LA)).toBe("18:30");
    expect(moved.games.map((x) => x.name)).toEqual(["Ark Nova"]);

    await deleteSeries(db, s.id, me, NOW);
    const home = await boardgameHome(db, groupId, me, NOW);
    expect(home.series).toEqual([]);
    expect(home.upcoming).toEqual([]);
  });
});

describe("who picks", () => {
  it("anyone can volunteer when nobody is picking; then the picker or a manager reassigns", async () => {
    const night = await createNight(db, groupId, me, { startsAt: hours(48) });
    expect(night.picker).toBeNull();
    const n = await updateNight(db, night.id, amy, { pickerId: amy });
    expect(n.picker?.name).toBe("amy");
    // Ben can't take it over or hand it to someone else...
    expect(await status(updateNight(db, night.id, ben, { pickerId: ben }))).toBe(403);
    // ...but Amy can pass it to him, and the owner can always reassign.
    expect((await updateNight(db, night.id, amy, { pickerId: ben })).picker?.name).toBe("ben");
    expect((await updateNight(db, night.id, me, { pickerId: me })).picker?.name).toBe("me");
    const stranger = (await signIn(db, profile("stranger"))).user.id;
    expect(await status(updateNight(db, night.id, me, { pickerId: stranger }))).toBe(400);
  });

  it("the next series night suggests the member after the last picker (in join order)", async () => {
    await createSeries(db, groupId, me, { weekday: 6, time: "19:00" }, NOW);
    const [first] = (await boardgameHome(db, groupId, me, NOW)).upcoming;
    expect(first.picker).toBeNull();
    await updateNight(db, first.id, amy, { pickerId: amy });
    const after = new Date(first.startsAt.getTime() + 24 * 3_600_000);
    const [second] = (await boardgameHome(db, groupId, me, after)).upcoming;
    expect(second.picker?.name).toBe("ben");
    await updateNight(db, second.id, ben, { note: "Bring snacks" });
    const later = new Date(second.startsAt.getTime() + 24 * 3_600_000);
    expect((await boardgameHome(db, groupId, me, later)).upcoming[0].picker?.name).toBe("me"); // wraps around
  });

  it("the picker (or a manager) edits the lineup; others queue instead", async () => {
    const night = await createNight(db, groupId, me, { startsAt: hours(48), pickerId: amy });
    const g = await createGame(db, groupId, ben, { name: "Cascadia" });
    expect(await status(addNightGame(db, night.id, g.id, ben))).toBe(403);
    expect((await addNightGame(db, night.id, g.id, amy)).games.map((x) => x.name)).toEqual(["Cascadia"]);
    expect(await status(removeNightGame(db, night.id, g.id, ben))).toBe(403);
    expect((await removeNightGame(db, night.id, g.id, me)).games).toEqual([]);
    const view = await getNight(db, night.id, ben);
    expect(view).toMatchObject({ canEditLineup: false, canAssignPicker: false, canManage: false });
  });
});

describe("queue and leaderboard data", () => {
  it("queues games (most wanted first); picking a game for a night takes it off the queue", async () => {
    const a = await createGame(db, groupId, me, { name: "Spirit Island" });
    const b = await createGame(db, groupId, me, { name: "Wingspan" });
    await queueGame(db, a.id, amy);
    await queueGame(db, b.id, ben);
    await queueGame(db, b.id, me);
    await queueGame(db, b.id, me); // twice is still once
    let home = await boardgameHome(db, groupId, me, NOW);
    expect(home.queue.map((q) => [q.name, q.queuedBy.length, q.queuedByMe])).toEqual([
      ["Wingspan", 2, true],
      ["Spirit Island", 1, false],
    ]);
    await unqueueGame(db, b.id, me);
    const night = await createNight(db, groupId, me, { startsAt: hours(48) });
    await addNightGame(db, night.id, a.id, me);
    home = await boardgameHome(db, groupId, me, NOW);
    expect(home.queue.map((q) => q.name)).toEqual(["Wingspan"]);
    // Recording a game on a night that already happened leaves the queue alone.
    const past = await createNight(db, groupId, me, { startsAt: hours(-48) });
    await addNightGame(db, past.id, b.id, me, NOW);
    expect((await boardgameHome(db, groupId, me, NOW)).queue.map((q) => q.name)).toEqual(["Wingspan"]);
  });

  it("library counts plays from nights that have happened, with averages and tags for the leaderboard", async () => {
    const a = await createGame(db, groupId, me, { name: "Brass", tags: ["heavy"] });
    const b = await createGame(db, groupId, me, { name: "Codenames", tags: ["party"] });
    const past1 = await createNight(db, groupId, me, { startsAt: hours(-24 * 14) });
    const past2 = await createNight(db, groupId, me, { startsAt: hours(-24 * 7) });
    const next = await createNight(db, groupId, me, { startsAt: hours(24 * 2) });
    await addNightGame(db, past1.id, a.id, me);
    await addNightGame(db, past2.id, a.id, me);
    await addNightGame(db, next.id, b.id, me);
    await rateGame(db, a.id, me, { score: 9 });
    await rateGame(db, a.id, amy, { score: 8 });
    await rateGame(db, b.id, ben, { score: 6 });
    const games = await listGames(db, groupId, me, NOW);
    expect(games.map((g) => [g.name, g.rating.avg, g.rating.count, g.plays, g.tags, g.myScore])).toEqual([
      ["Brass", 8.5, 2, 2, ["heavy"], 9],
      ["Codenames", 6, 1, 0, ["party"], null],
    ]);
    expect(games[0].lastPlayedAt).toBe(hours(-24 * 7).toISOString());
    const home = await boardgameHome(db, groupId, me, NOW);
    expect(home.past.map((n) => n.id)).toEqual([past2.id, past1.id]);
    expect(home.upcoming.map((n) => n.id)).toEqual([next.id]);
  });
});

describe("who's coming", () => {
  it("members answer going / maybe / can't; guests count as going; counts show on the night", async () => {
    const night = await createNight(db, groupId, me, { startsAt: hours(48) });
    await setRsvp(db, night.id, me, { status: "going" });
    await setRsvp(db, night.id, amy, { status: "maybe" });
    let n = await setRsvp(db, night.id, ben, { status: "no" });
    n = await addGuest(db, night.id, amy, "  Amy's   friend Jo ");
    expect(n.attendance.guests.map((g) => g.name)).toEqual(["Amy's friend Jo"]);
    expect(n.attendance.rsvps.map((r) => `${r.name}:${r.status}`).sort()).toEqual(["amy:maybe", "ben:no", "me:going"]);
    const [summary] = (await boardgameHome(db, groupId, amy, NOW)).upcoming;
    expect(summary).toMatchObject({ going: 2, maybe: 1, myRsvp: "maybe" });
    // Changing your mind, and clearing.
    expect((await setRsvp(db, night.id, amy, { status: "going" })).going).toBe(3);
    expect((await setRsvp(db, night.id, amy, { status: null })).going).toBe(2);
  });

  it("only the owner, a host or the picker records others; guests come off by whoever added them or a manager", async () => {
    const night = await createNight(db, groupId, me, { startsAt: hours(-24), pickerId: amy });
    expect(await status(setRsvp(db, night.id, ben, { status: "going", userId: amy }))).toBe(403);
    // After the night, the picker records who came.
    expect((await setRsvp(db, night.id, amy, { status: "going", userId: ben })).attendance.rsvps).toMatchObject([{ name: "ben", status: "going" }]);
    const withGuest = await addGuest(db, night.id, ben, "Sam");
    const guestId = withGuest.attendance.guests[0].id;
    expect((await getNight(db, night.id, me)).attendance.guests[0].canRemove).toBe(true);
    const stranger = (await signIn(db, profile("stranger2"))).user.id;
    expect(await status(addGuest(db, night.id, stranger, "x"))).toBe(404);
    expect(await status(addGuest(db, night.id, ben, "  "))).toBe(400);
    expect((await removeGuest(db, night.id, guestId, me)).attendance.guests).toEqual([]);
  });
});
