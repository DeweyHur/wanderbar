import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { groups, invites, memberships, users } from "../db/schema";
import { badRequest, forbidden, HttpError, notFound } from "./errors";
import { hashToken, newToken } from "./tokens";

const INVITE_DAYS = 7;

export type Role = "owner" | "host" | "member";
export type GroupModule = "food" | "boardgame";

export type NewGroup = {
  name: string;
  module?: GroupModule;
  defaultLocale?: string;
  timezone?: string;
  currency?: string;
};

export async function createGroup(db: Db, userId: string, input: NewGroup) {
  const name = input.name.trim();
  if (!name) throw badRequest("group.name_required");
  const [group] = await db
    .insert(groups)
    .values({
      name,
      createdBy: userId,
      module: input.module ?? "food",
      defaultLocale: input.defaultLocale ?? "en",
      timezone: input.timezone ?? "UTC",
      currency: input.currency ?? "USD",
    })
    .returning();
  await db.insert(memberships).values({ groupId: group.id, userId, role: "owner" });
  return { id: group.id, name: group.name, module: group.module, role: "owner" as Role };
}

export async function myGroups(db: Db, userId: string) {
  return db
    .select({ id: groups.id, name: groups.name, module: groups.module, role: memberships.role })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.joinedAt));
}

/**
 * The single gate for group-scoped data: every group-scoped query must go through this first.
 * Non-members get 404, not 403, so outsiders can't probe which groups exist.
 */
export async function requireMember(db: Db, groupId: string, userId: string): Promise<Role> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)))
    .limit(1);
  if (!rows[0]) throw notFound("group.not_found");
  return rows[0].role;
}

export async function groupDetail(db: Db, groupId: string, userId: string) {
  const role = await requireMember(db, groupId, userId);
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.groupId, groupId))
    .orderBy(asc(memberships.joinedAt));
  return {
    id: group.id,
    name: group.name,
    module: group.module,
    defaultLocale: group.defaultLocale,
    timezone: group.timezone,
    currency: group.currency,
    myRole: role,
    members,
  };
}

/** Owners only. Returns the raw token once; it is never stored. */
export async function createInvite(db: Db, groupId: string, userId: string, now = new Date()) {
  const role = await requireMember(db, groupId, userId);
  if (role !== "owner") throw forbidden("invite.owner_only");
  const token = newToken();
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(invites).values({ groupId, tokenHash: hashToken(token), createdBy: userId, expiresAt });
  return { token, expiresAt };
}

async function liveInvite(db: Db, token: string, now: Date) {
  const rows = await db
    .select({ invite: invites, groupName: groups.name, defaultLocale: groups.defaultLocale })
    .from(invites)
    .innerJoin(groups, eq(groups.id, invites.groupId))
    .where(eq(invites.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound("invite.not_found");
  if (row.invite.revokedAt || row.invite.expiresAt <= now) throw new HttpError(410, "invite.expired");
  return row;
}

/** Shows the group name before joining. Requires a signed-in user (enforced by the route). */
export async function previewInvite(db: Db, token: string, now = new Date()) {
  const row = await liveInvite(db, token, now);
  return {
    groupId: row.invite.groupId,
    groupName: row.groupName,
    defaultLocale: row.defaultLocale,
    expiresAt: row.invite.expiresAt,
  };
}

export async function acceptInvite(db: Db, token: string, userId: string, now = new Date()) {
  const row = await liveInvite(db, token, now);
  await db
    .insert(memberships)
    .values({ groupId: row.invite.groupId, userId, role: "member" })
    .onConflictDoNothing();
  return { groupId: row.invite.groupId, groupName: row.groupName };
}

export async function revokeInvites(db: Db, groupId: string, userId: string, now = new Date()) {
  const role = await requireMember(db, groupId, userId);
  if (role !== "owner") throw forbidden("invite.owner_only");
  await db.update(invites).set({ revokedAt: now }).where(eq(invites.groupId, groupId));
}
