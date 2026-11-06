import { and, asc, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { chatMessages, memberships, users } from "../db/schema";
import { badRequest, forbidden, notFound } from "./errors";
import { requireMember } from "./groups";
import { displayName, notifyGroup } from "./push";

/**
 * Group chat: plain text messages, oldest first. Apps poll for new ones (`after`) while the chat is
 * open and page back (`before`); opening the chat marks it read. Members get a push per message.
 */

const PAGE = 50;
const MAX_LEN = 2000;

type Row = { m: typeof chatMessages.$inferSelect; name: string | null; email: string | null };
const view = (r: Row, me: string) => ({
  id: r.m.id,
  userId: r.m.userId,
  name: r.m.userId ? r.name || (r.email ?? "").split("@")[0] : null,
  body: r.m.deletedAt ? "" : r.m.body,
  deleted: !!r.m.deletedAt,
  mine: r.m.userId === me,
  createdAt: r.m.createdAt,
});

export async function listMessages(db: Db, groupId: string, userId: string, opts: { after?: Date; before?: Date } = {}) {
  await requireMember(db, groupId, userId);
  const base = db
    .select({ m: chatMessages, name: users.name, email: users.email })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.userId));
  let rows: Row[];
  let hasMore = false;
  if (opts.after) {
    // Polling: everything newer than what the app already has.
    rows = await base
      .where(and(eq(chatMessages.groupId, groupId), gt(chatMessages.createdAt, opts.after)))
      .orderBy(asc(chatMessages.createdAt))
      .limit(200);
  } else {
    const page = await base
      .where(and(eq(chatMessages.groupId, groupId), opts.before ? lt(chatMessages.createdAt, opts.before) : undefined))
      .orderBy(desc(chatMessages.createdAt))
      .limit(PAGE + 1);
    hasMore = page.length > PAGE;
    rows = page.slice(0, PAGE).reverse();
  }
  // Read up to the newest message seen (its own timestamp, so app and DB clocks never disagree).
  const newest = rows.at(-1)?.m.createdAt;
  if (!opts.before && newest) await markRead(db, groupId, userId, newest);
  return { messages: rows.map((r) => view(r, userId)), hasMore };
}

async function markRead(db: Db, groupId: string, userId: string, upTo: Date) {
  await db
    .update(memberships)
    .set({ chatReadAt: sql`greatest(coalesce(${memberships.chatReadAt}, ${upTo}), ${upTo})` })
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
}

export async function sendMessage(db: Db, groupId: string, userId: string, text: string) {
  await requireMember(db, groupId, userId);
  const body = text.replace(/\r\n/g, "\n").trim();
  if (!body) throw badRequest("chat.empty");
  if (body.length > MAX_LEN) throw badRequest("chat.too_long");
  const [m] = await db.insert(chatMessages).values({ groupId, userId, body }).returning();
  await markRead(db, groupId, userId, m.createdAt);
  notifyGroup(db, groupId, userId, { type: "chat", who: await displayName(db, userId), text: body, groupId });
  const [r] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
  return view({ m, name: r?.name ?? null, email: r?.email ?? null }, userId);
}

/** Your own messages, or anything as the group owner. The text goes; a "deleted" marker stays. */
export async function deleteMessage(db: Db, messageId: string, userId: string) {
  const [m] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId));
  if (!m) throw notFound("chat.not_found");
  const role = await requireMember(db, m.groupId, userId).catch(() => {
    throw notFound("chat.not_found");
  });
  if (m.userId !== userId && role !== "owner") throw forbidden("chat.delete_forbidden");
  await db.update(chatMessages).set({ body: "", deletedAt: new Date() }).where(eq(chatMessages.id, messageId));
  return { ok: true };
}

/** Unread messages per group for a user (others' messages since they last opened the chat, or since joining). */
export async function unreadCounts(db: Db, userId: string) {
  const rows = await db
    .select({ groupId: memberships.groupId, n: sql<number>`count(${chatMessages.id})::int` })
    .from(memberships)
    .innerJoin(
      chatMessages,
      and(
        eq(chatMessages.groupId, memberships.groupId),
        gt(chatMessages.createdAt, sql`coalesce(${memberships.chatReadAt}, ${memberships.joinedAt})`),
        ne(chatMessages.userId, userId),
        sql`${chatMessages.deletedAt} is null`,
      ),
    )
    .where(eq(memberships.userId, userId))
    .groupBy(memberships.groupId);
  return new Map(rows.map((r) => [r.groupId, r.n]));
}
