import { type AnyPgColumn, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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

// ---- Core: items (what a group rates) and their links ----

/** Restaurant and menu for the food module; the board game module adds "game" later. */
export const itemType = pgEnum("item_type", ["restaurant", "menu"]);
export const linkKind = pgEnum("link_kind", ["yelp", "gmaps", "bgg", "bga", "rulebook", "video", "other"]);

export const items = pgTable(
  "items",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    module: groupModule("module").notNull(),
    type: itemType("type").notNull(),
    /** A menu's restaurant. */
    parentId: text("parent_id").references((): AnyPgColumn => items.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** A category id defined by the module (e.g. "korean"), translated on screen; never display text. */
    category: text("category"),
    memo: text("memo").notNull().default(""),
    extra: jsonb("extra").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("items_group_type_idx").on(t.groupId, t.type), index("items_parent_idx").on(t.parentId)],
);

export const externalLinks = pgTable(
  "external_links",
  {
    id: id(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    kind: linkKind("kind").notNull(),
    url: text("url").notNull(),
    label: text("label"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("external_links_item_kind_url_uq").on(t.itemId, t.kind, t.url)],
);

/** Restaurant fields used for search and duplicate checks. One row per restaurant item. */
export const restaurantDetails = pgTable(
  "restaurant_details",
  {
    itemId: text("item_id")
      .primaryKey()
      .references(() => items.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    /** yelp.com/biz/<alias>: the duplicate key for Yelp shares. */
    yelpAlias: text("yelp_alias"),
    /** Google Places place id: the duplicate key for Google shares and the source of opening hours. */
    googlePlaceKey: text("google_place_key"),
    address: text("address").notNull().default(""),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    hoursRaw: text("hours_raw").notNull().default(""),
    hoursFetchedAt: timestamp("hours_fetched_at", { withTimezone: true }),
    /** Google Places photo resource name (places/…/photos/…) for the cover photo; served through our API. */
    photoName: text("photo_name"),
  },
  (t) => [
    uniqueIndex("restaurant_details_group_yelp_uq").on(t.groupId, t.yelpAlias),
    uniqueIndex("restaurant_details_group_google_uq").on(t.groupId, t.googlePlaceKey),
  ],
);

/**
 * A member's rating of a menu: one per person per menu, updated when they eat it again.
 * score is in half stars, 1..10 (= 0.5..5 stars).
 */
export const ratings = pgTable(
  "ratings",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    review: text("review").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ratings_item_user_uq").on(t.itemId, t.userId), index("ratings_group_idx").on(t.groupId)],
);

/** "Went there": from finishing a restaurant stop in a day route (stopId set) or added by hand. */
export const visits = pgTable(
  "visits",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
    stopId: text("stop_id").references((): AnyPgColumn => planStops.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("visits_item_idx").on(t.itemId, t.visitedAt), uniqueIndex("visits_stop_uq").on(t.stopId)],
);

export const menuDetails = pgTable("menu_details", {
  itemId: text("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  /** Latest known price in minor units of the currency (cents; whole won for KRW). */
  priceMinor: integer("price_minor"),
  currency: text("currency").notNull().default("USD"),
});

// ---- Food module: day route (ported from the wanderbar app) ----

export const stopStatus = pgEnum("stop_status", ["pending", "current", "done", "skipped"]);
export const teslaFormat = pgEnum("tesla_format", ["address", "nameAddress", "coords", "link", "full"]);
export const devicePlatform = pgEnum("device_platform", ["android", "ios"]);

/** A day route. Personal in the MVP: only its owner sees it, inside a group they belong to. */
export const plans = pgTable(
  "plans",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("plans_group_user_idx").on(t.groupId, t.userId)],
);

export const planStops = pgTable(
  "plan_stops",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    /** Set when the stop is a saved restaurant (milestone 3); null for any other place. */
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    memo: text("memo").notNull().default(""),
    address: text("address").notNull().default(""),
    /** A Google Maps link pasted or shared in (e.g. maps.app.goo.gl/...). */
    mapsUrl: text("maps_url").notNull().default(""),
    /** A Yelp link shared in from the Yelp app. */
    yelpUrl: text("yelp_url").notNull().default(""),
    /** Free-form opening hours, parsed by @wanderbar/route parseHours. */
    hoursRaw: text("hours_raw").notNull().default(""),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    googlePlaceId: text("google_place_id").notNull().default(""),
    /** Whether the place is somewhere to eat ("food") or not ("other"); null = not checked yet. */
    placeKind: text("place_kind"),
    orderIndex: integer("order_index").notNull().default(0),
    status: stopStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("plan_stops_plan_idx").on(t.planId, t.orderIndex)],
);

/** Which text format the Tesla app accepted, per user and phone platform (from the format tester). */
export const teslaFormats = pgTable(
  "tesla_formats",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: devicePlatform("platform").notNull(),
    format: teslaFormat("format").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.platform] })],
);
