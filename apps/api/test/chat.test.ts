import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { signIn } from "@/lib/auth";
import { deleteMessage, listMessages, sendMessage } from "@/lib/chat";
import { acceptInvite, createGroup, createInvite, myGroups } from "@/lib/groups";
import { flushPush, setPushSender, type PushMessage } from "@/lib/push";
import { registerPushToken } from "@/lib/push";
import { profile, testDb } from "./db";

let db: Db;
let me: string;
let amy: string;
let groupId: string;
let sent: PushMessage[];
const status = (p: Promise<unknown>) => p.then(() => 200, (e) => e.status as number);
const later = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  db = await testDb();
  me = (await signIn(db, profile("me"))).user.id;
  amy = (await signIn(db, profile("amy"))).user.id;
  groupId = (await createGroup(db, me, { name: "Game Club", module: "boardgame" })).id;
  await acceptInvite(db, (await createInvite(db, groupId, me)).token, amy);
  sent = [];
  setPushSender(async (m) => {
    sent.push(m);
    return "ok";
  });
});
afterEach(() => setPushSender(null));

describe("group chat", () => {
  it("sends and lists messages oldest first; polling with `after` gets only new ones", async () => {
    const a = await sendMessage(db, groupId, me, "  Who's bringing Brass?  ");
    expect(a).toMatchObject({ body: "Who's bringing Brass?", mine: true, name: "me" });
    await later(5);
    await sendMessage(db, groupId, amy, "Me!\r\nAnd snacks");
    const list = await listMessages(db, groupId, me);
    expect(list.messages.map((m) => [m.name, m.body, m.mine])).toEqual([
      ["me", "Who's bringing Brass?", true],
      ["amy", "Me!\nAnd snacks", false],
    ]);
    expect(await listMessages(db, groupId, me, { after: new Date(list.messages[1].createdAt) })).toMatchObject({ messages: [] });
    expect((await listMessages(db, groupId, me, { after: new Date(list.messages[0].createdAt) })).messages.map((m) => m.body)).toEqual(["Me!\nAnd snacks"]);
    expect(await status(sendMessage(db, groupId, me, "   "))).toBe(400);
    expect(await status(sendMessage(db, groupId, me, "x".repeat(2001)))).toBe(400);
  });

  it("pages back 50 at a time", async () => {
    for (let i = 0; i < 55; i++) await sendMessage(db, groupId, me, `m${i}`);
    const first = await listMessages(db, groupId, me);
    expect(first.messages).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(first.messages.at(-1)?.body).toBe("m54");
    const older = await listMessages(db, groupId, me, { before: new Date(first.messages[0].createdAt) });
    expect(older.messages.map((m) => m.body)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
    expect(older.hasMore).toBe(false);
  });

  it("counts unread messages from others until the chat is opened", async () => {
    await sendMessage(db, groupId, amy, "hi");
    await sendMessage(db, groupId, amy, "anyone?");
    await sendMessage(db, groupId, me, "here");
    expect((await myGroups(db, me))[0].unread).toBe(0); // sending marks read
    expect((await myGroups(db, amy))[0].unread).toBe(1); // my "here"
    await listMessages(db, groupId, amy);
    expect((await myGroups(db, amy))[0].unread).toBe(0);
    await sendMessage(db, groupId, amy, "see you sat");
    expect((await myGroups(db, me))[0].unread).toBe(1);
  });

  it("only members; delete your own (owner can delete any); deleted messages keep their place", async () => {
    const stranger = (await signIn(db, profile("stranger"))).user.id;
    expect(await status(listMessages(db, groupId, stranger))).toBe(404);
    expect(await status(sendMessage(db, groupId, stranger, "hey"))).toBe(404);
    const mine = await sendMessage(db, groupId, amy, "oops");
    const owners = await sendMessage(db, groupId, me, "rules");
    expect(await status(deleteMessage(db, owners.id, amy))).toBe(403);
    expect(await status(deleteMessage(db, mine.id, stranger))).toBe(404);
    await deleteMessage(db, mine.id, me); // owner
    const list = await listMessages(db, groupId, amy);
    expect(list.messages.map((m) => [m.body, m.deleted])).toEqual([
      ["", true],
      ["rules", false],
    ]);
  });

  it("pushes each message to the others", async () => {
    await registerPushToken(db, amy, { token: "amy-phone", platform: "android", locale: "ko" });
    await registerPushToken(db, me, { token: "my-phone", platform: "ios", locale: "en" });
    await sendMessage(db, groupId, me, "Saturday at 7?");
    await flushPush();
    expect(sent).toEqual([{ token: "amy-phone", title: "Game Club", body: "💬 me: Saturday at 7?", data: { path: `/group/${groupId}/chat`, type: "chat", groupId } }]);
  });
});
