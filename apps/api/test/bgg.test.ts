import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import { bggAvailable, bggIdFromUrl, getBggGame, parseSearch, parseThing, rankHits, searchGames } from "@/lib/bgg";
import { createGame, getGame, listGames, updateGame } from "@/lib/boardgame";
import { createGroup } from "@/lib/groups";
import { profile, testDb } from "./db";

const SEARCH = `<?xml version="1.0" encoding="utf-8"?><items total="4" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="266192"><name type="primary" value="Wingspan"/><yearpublished value="2019"/></item>
  <item type="boardgame" id="366161"><name type="primary" value="Wingspan Asia"/><yearpublished value="2022"/></item>
  <item type="boardgame" id="999"><name type="alternate" value="Wingspan (fan edition)"/></item>
  <item type="boardgame" id="1234"><name type="primary" value="Birds of Wingspan Valley"/><yearpublished value="2001"/></item>
</items>`;

const THING = `<?xml version="1.0" encoding="utf-8"?><items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="266192">
    <thumbnail>https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__thumb/img/x.jpg</thumbnail>
    <image>//cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__original/img/y.jpg</image>
    <name type="alternate" sortindex="1" value="Пернатые" />
    <name type="primary" sortindex="1" value="Wingspan" />
    <description>Attract birds&amp;#10;to your wildlife preserves.</description>
    <yearpublished value="2019" /><minplayers value="1" /><maxplayers value="5" />
    <playingtime value="70" /><minplaytime value="40" /><maxplaytime value="70" />
    <statistics page="1"><ratings><usersrated value="1" /><averageweight value="2.4783" /></ratings></statistics>
    <link type="boardgamecategory" id="1089" value="Animals" />
    <link type="boardgamecategory" id="1002" value="Card Game" />
    <link type="boardgamemechanic" id="2041" value="Hand Management" />
    <link type="boardgamedesigner" id="1" value="Elizabeth Hargrave" />
  </item>
</items>`;

describe("BGG XML", () => {
  it("parses search results (primary names, years) and ranks exact matches first", () => {
    const hits = parseSearch(SEARCH);
    expect(hits).toHaveLength(4);
    expect(hits[2]).toEqual({ id: 999, name: "Wingspan (fan edition)", year: null });
    expect(rankHits(hits, "wingspan").map((h) => h.id)).toEqual([266192, 366161, 999, 1234]);
    expect(parseSearch(`<items total="0"></items>`)).toEqual([]);
  });

  it("parses a game: primary name, https pictures, players, time, weight", () => {
    expect(parseThing(THING)).toEqual({
      id: 266192,
      name: "Wingspan",
      year: 2019,
      image: "https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__original/img/y.jpg",
      thumbnail: "https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__thumb/img/x.jpg",
      minPlayers: 1,
      maxPlayers: 5,
      playingTime: 70,
      weight: 2.48,
      categories: ["Animals", "Card Game"],
      mechanics: ["Hand Management"],
    });
    expect(parseThing("<items></items>")).toBeNull();
  });

  it("finds the BGG id in game and expansion links", () => {
    expect(bggIdFromUrl("https://boardgamegeek.com/boardgame/266192/wingspan")).toBe(266192);
    expect(bggIdFromUrl("https://www.boardgamegeek.com/boardgameexpansion/290837/wingspan-european")).toBe(290837);
    expect(bggIdFromUrl("https://boardgamearena.com/gamepanel?game=wingspan")).toBeNull();
  });
});

describe("BGG calls", () => {
  let db: Db;
  const env = { ...process.env };
  beforeEach(async () => {
    db = await testDb();
    process.env.BGG_API_TOKEN = "test-token";
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("sends the token, caches answers, and is off without a token", async () => {
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toMatch(/^https:\/\/boardgamegeek\.com\/xmlapi2\/search\?type=boardgame&query=wingspan$/i);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
      return new Response(SEARCH);
    });
    expect((await searchGames(db, " Wingspan ", f as typeof fetch))[0].name).toBe("Wingspan");
    await searchGames(db, "wingspan", f as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1); // second time from the cache
    expect(await searchGames(db, "w", f as typeof fetch)).toEqual([]); // too short to ask

    const busy = vi.fn(async () => new Response("", { status: 429 }));
    await expect(getBggGame(db, 1, busy as typeof fetch)).rejects.toMatchObject({ status: 503, code: "bgg.busy" });
    delete process.env.BGG_API_TOKEN;
    expect(bggAvailable()).toBe(false);
  });

  it("a game with a BGG link gets its picture and details; changing the link refreshes them", async () => {
    const me = (await signIn(db, profile("me"))).user.id;
    const groupId = (await createGroup(db, me, { name: "g", module: "boardgame" })).id;
    const thing = (id: number, name: string) =>
      THING.replace(/266192/g, String(id)).replace('value="Wingspan"', `value="${name}"`).replace(/y\.jpg/, `${id}.jpg`);
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const id = Number(/id=(\d+)/.exec(String(url))?.[1]);
      return new Response(thing(id, id === 266192 ? "Wingspan" : "Other"));
    }) as typeof fetch;

    const g = await createGame(db, groupId, me, { name: "Wingspan", links: [{ kind: "bgg", url: "https://boardgamegeek.com/boardgame/266192/wingspan" }] });
    expect(g.bgg).toMatchObject({ id: 266192, minPlayers: 1, maxPlayers: 5, playingTime: 70, image: expect.stringContaining("266192.jpg") });
    expect((await listGames(db, groupId, me))[0].bgg?.thumbnail).toContain("__thumb");

    const moved = await updateGame(db, g.id, me, { links: [{ kind: "bgg", url: "https://boardgamegeek.com/boardgame/7/other" }] });
    expect(moved.bgg).toMatchObject({ id: 7, image: expect.stringContaining("7.jpg") });
    expect((await updateGame(db, g.id, me, { links: [] })).bgg).toBeNull();

    // Without a token the game is saved without a picture rather than failing.
    delete process.env.BGG_API_TOKEN;
    const plain = await createGame(db, groupId, me, { name: "Azul", links: [{ kind: "bgg", url: "https://boardgamegeek.com/boardgame/230802/azul" }] });
    expect((await getGame(db, plain.id, me)).bgg).toBeNull();
  });
});
