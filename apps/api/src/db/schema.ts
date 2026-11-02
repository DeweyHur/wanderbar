import { index, pgEnum, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const memberRole = pgEnum("member_role", ["owner", "host", "member"]);
/** Which module a group runs (food & day route first, board game night later). */
export const groupModule = pgEnum("group_module", ["food", "boardgame"]);

export const users = pgTable("users", {
  id: id(),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  image: text("image"),
  /** UI language chosen in the app's settings; null = follow the device. */
  locale: text("locale"),
  createdAt: createdAt(),
});

/** App sessions. Only the SHA-256 of the bearer token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const groups = pgTable("groups", {
  id: id(),
  name: text("name").notNull(),
  module: groupModule("module").notNull().default("food"),
  /** Locale for group-level text (invite previews) and new members' first default. */
  defaultLocale: text("default_locale").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  currency: text("currency").notNull().default("USD"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

/** Invite links. Only the SHA-256 of the link token is stored; a lost link is reissued, not recovered. */
export const invites = pgTable(
  "invites",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("invites_group_idx").on(t.groupId)],
);
