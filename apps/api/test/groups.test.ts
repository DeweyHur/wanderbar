import { beforeEach, describe, expect, it } from "vitest";
import { signIn } from "@/lib/auth";
import type { Db } from "@/db/client";
import { acceptInvite, createGroup, createInvite, groupDetail, myGroups, previewInvite, revokeInvites } from "@/lib/groups";
import { profile, testDb } from "./db";

let db: Db;
let owner: string;
let friend: string;
let stranger: string;

beforeEach(async () => {
  db = await testDb();
  owner = (await signIn(db, profile("owner"))).user.id;
  friend = (await signIn(db, profile("friend"))).user.id;
  stranger = (await signIn(db, profile("stranger"))).user.id;
});

const status = (p: Promise<unknown>) => p.then(() => 200, (e) => e.status as number);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => e.code as string);

describe("groups", () => {
  it("creator becomes the owner", async () => {
    const g = await createGroup(db, owner, { name: "  맛집 탐방대 ", defaultLocale: "ko" });
    expect(g).toMatchObject({ name: "맛집 탐방대", module: "food", role: "owner" });
    expect(await myGroups(db, owner)).toEqual([{ id: g.id, name: "맛집 탐방대", module: "food", role: "owner" }]);
    expect((await groupDetail(db, g.id, owner)).defaultLocale).toBe("ko");
  });

  it("rejects an empty name", async () => {
    expect(await status(createGroup(db, owner, { name: "   " }))).toBe(400);
  });

  it("hides a group from non-members with 404", async () => {
    const g = await createGroup(db, owner, { name: "g" });
    expect(await status(groupDetail(db, g.id, stranger))).toBe(404);
    expect(await status(groupDetail(db, "no-such-group", stranger))).toBe(404);
  });
});

describe("invites", () => {
  it("lets a friend join through an invite link", async () => {
    const g = await createGroup(db, owner, { name: "g" });
    const { token } = await createInvite(db, g.id, owner);
    expect(await previewInvite(db, token)).toMatchObject({ groupId: g.id, groupName: "g" });
    expect(await acceptInvite(db, token, friend)).toEqual({ groupId: g.id, groupName: "g" });

    const detail = await groupDetail(db, g.id, friend);
    expect(detail.myRole).toBe("member");
    expect(detail.members.map((m) => m.role)).toEqual(["owner", "member"]);
  });

  it("is idempotent and never downgrades the owner", async () => {
    const g = await createGroup(db, owner, { name: "g" });
    const { token } = await createInvite(db, g.id, owner);
    await acceptInvite(db, token, friend);
    await acceptInvite(db, token, friend);
    await acceptInvite(db, token, owner);
    const detail = await groupDetail(db, g.id, owner);
    expect(detail.members).toHaveLength(2);
    expect(detail.myRole).toBe("owner");
  });

  it("only owners can create or revoke invites", async () => {
    const g = await createGroup(db, owner, { name: "g" });
    await acceptInvite(db, (await createInvite(db, g.id, owner)).token, friend);
    expect(await status(createInvite(db, g.id, friend))).toBe(403);
    expect(await status(revokeInvites(db, g.id, friend))).toBe(403);
    expect(await status(createInvite(db, g.id, stranger))).toBe(404);
  });

  it("rejects expired, revoked and unknown links", async () => {
    const g = await createGroup(db, owner, { name: "g" });
    const old = await createInvite(db, g.id, owner, new Date("2026-01-01"));
    expect(await status(acceptInvite(db, old.token, friend, new Date("2026-01-09")))).toBe(410);

    const fresh = await createInvite(db, g.id, owner);
    await revokeInvites(db, g.id, owner);
    expect(await status(acceptInvite(db, fresh.token, friend))).toBe(410);

    expect(await status(acceptInvite(db, "made-up", friend))).toBe(404);
    expect(await code(acceptInvite(db, "made-up", friend))).toBe("invite.not_found");
    expect(await code(acceptInvite(db, fresh.token, friend))).toBe("invite.expired");
  });
});
