import { type AnyPgColumn, boolean, date, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const memberRole = pgEnum("member_role", ["owner", "host", "member"]);
/** Which module a group runs (food & day route first, board game night later). */
export const groupModule = pgEnum("group_module", ["food", "boardgame", "fitness", "realestate"]);

export const users = pgTable("users", {
  id: id(),
  /** Google account (sub claim); null for an Apple-only account. */
  googleSub: text("google_sub").unique(),
  /** Sign in with Apple account (sub claim); null until the user signs in with Apple. */
  appleSub: text("apple_sub").unique(),
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
  /** The group's color theme (an id the apps know, e.g. "pink", "night"). */
  theme: text("theme").notNull().default("pink"),
  /** The group's font set (an id the apps know: "round", "clean", "bold", "hand"). */
  font: text("font").notNull().default("round"),
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
    /** When this member last opened the group chat (unread = newer messages from others). */
    chatReadAt: timestamp("chat_read_at", { withTimezone: true }),
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

/** Food module: restaurant, its menus, and dishes made at home. Board game module: games. */
export const itemType = pgEnum("item_type", ["restaurant", "menu", "dish", "game", "property", "event"]);
/** What kind of place a saved place is (from Google's type when saved): each has its own page. */
export const placeType = pgEnum("place_type", ["food", "sight", "venue", "stay", "other"]);
export const linkKind = pgEnum("link_kind", ["yelp", "gmaps", "bgg", "bga", "rulebook", "video", "other", "tts", "zillow", "redfin", "realtor"]);

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
    /**
     * Somewhere to eat (menus), a sight, an event venue (events), a place to stay, or anything else.
     * Null: saved before places had types; treated as food until Google's type is looked up once.
     */
    placeType: placeType("place_type"),
  },
  (t) => [
    uniqueIndex("restaurant_details_group_yelp_uq").on(t.groupId, t.yelpAlias),
    uniqueIndex("restaurant_details_group_google_uq").on(t.groupId, t.googlePlaceKey),
  ],
);

/** Something seen at an event venue (a show, a game, a festival): its day. Rated like a menu. */
export const eventDetails = pgTable("event_details", {
  itemId: text("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  onDate: date("on_date"),
});

/**
 * A member's rating of a menu: one per person per menu, updated when they eat it again.
 * score: menus use half stars, whole numbers 1..10 (= 0.5..5 stars); board games use 1.0..10.0 in steps of 0.1.
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
    score: doublePrecision("score").notNull(),
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

/**
 * A photo someone added to a restaurant, menu or dish. The file lives in the private Blob store under
 * blobPath (resized, metadata stripped on the device); takenAt is the camera's time when known.
 */
export const photos = pgTable(
  "photos",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blobPath: text("blob_path").notNull(),
    contentType: text("content_type").notNull(),
    /** A small copy (~360px) for lists and strips; null for photos uploaded before thumbnails. */
    thumbPath: text("thumb_path"),
    thumbType: text("thumb_type"),
    width: integer("width"),
    height: integer("height"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    /** Real estate: the space the photo shows ("kitchen", …) and the tour it was taken on. */
    room: text("room"),
    tourId: text("tour_id").references((): AnyPgColumn => tours.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("photos_item_idx").on(t.itemId, t.createdAt)],
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
    /** May be empty: the route is then called by its date. */
    title: text("title").notNull(),
    /** The day the route is for (YYYY-MM-DD in the group's time zone); can be in the future. */
    date: date("date", { mode: "string" }),
    /** A day at home: lunch and dinner are planned (meals) instead of, or as well as, stops. */
    atHome: boolean("at_home").notNull().default(false),
    /** Set for a day of a trip: the day's route ends at that night's hotel. */
    tripId: text("trip_id").references(() => trips.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("plans_group_user_idx").on(t.groupId, t.userId), index("plans_trip_idx").on(t.tripId)],
);

/** How a trip gets there: driving your own car, or flying / train / bus (maybe with a rental car). */
export const tripTransport = pgEnum("trip_transport", ["car", "flight", "train", "bus", "other"]);

/** A trip: several days away, each day a route (plans.tripId), with hotels for the nights. Personal, like routes. */
export const trips = pgTable(
  "trips",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** First and last day (YYYY-MM-DD), inclusive. */
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    transport: tripTransport("transport").notNull().default("car"),
    /** A rental car there (only asked when not driving your own car). */
    rentalCar: boolean("rental_car").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("trips_group_user_idx").on(t.groupId, t.userId)],
);

/** Where you sleep: a hotel for the nights from checkIn up to (not including) checkOut. */
export const tripHotels = pgTable(
  "trip_hotels",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address").notNull().default(""),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    googlePlaceId: text("google_place_id").notNull().default(""),
    mapsUrl: text("maps_url").notNull().default(""),
    checkIn: date("check_in", { mode: "string" }).notNull(),
    checkOut: date("check_out", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("trip_hotels_trip_idx").on(t.tripId)],
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

// ---- Board game module: regular meetups, game nights, the queue, tags ----

/** Group-defined labels for items (e.g. "coop", "heavy", "party"). The leaderboard filters by them. */
export const tags = pgTable(
  "tags",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Lowercased name: "Coop" and "coop" are the same tag. */
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_group_key_uq").on(t.groupId, t.key)],
);

export const itemTags = pgTable(
  "item_tags",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] }), index("item_tags_tag_idx").on(t.tagId)],
);

/** A regular meetup: every N weeks on a weekday at a local time, in the group's time zone. */
export const meetupSeries = pgTable(
  "meetup_series",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    /** 0 = Sunday .. 6 = Saturday. */
    weekday: integer("weekday").notNull(),
    /** Local time "HH:MM". */
    time: text("time").notNull(),
    everyWeeks: integer("every_weeks").notNull().default(1),
    /** First possible day (YYYY-MM-DD); anchors the every-N-weeks cycle. */
    startDate: date("start_date", { mode: "string" }).notNull(),
    location: text("location").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("meetup_series_group_idx").on(t.groupId)],
);

/** One game night: from a series (created ahead automatically) or a one-off. */
export const meetupNights = pgTable(
  "meetup_nights",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    seriesId: text("series_id").references(() => meetupSeries.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    location: text("location").notNull().default(""),
    note: text("note").notNull().default(""),
    /** Who picks the games for this night. */
    pickerId: text("picker_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("meetup_nights_group_idx").on(t.groupId, t.startsAt), uniqueIndex("meetup_nights_series_start_uq").on(t.seriesId, t.startsAt)],
);

/** The games planned (and, once the night has passed, played) on a night. */
export const nightGames = pgTable(
  "night_games",
  {
    nightId: text("night_id")
      .notNull()
      .references(() => meetupNights.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.nightId, t.itemId] }), index("night_games_item_idx").on(t.itemId)],
);

/** "I want to play this": the group's wishlist queue, one entry per member per game. */
export const gameQueue = pgTable(
  "game_queue",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.userId] }), index("game_queue_group_idx").on(t.groupId)],
);

export const mealSlot = pgEnum("meal_slot", ["lunch", "dinner"]);

/** What's for lunch or dinner on a day route at home: a dish from the group's home cooking, or just a name. */
export const meals = pgTable(
  "meals",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    slot: mealSlot("slot").notNull(),
    dishId: text("dish_id").references(() => items.id, { onDelete: "set null" }),
    /** Shown when there is no dish (or the dish was deleted). */
    title: text("title").notNull().default(""),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("meals_plan_idx").on(t.planId, t.slot)],
);

/** The group's shopping list. An item may be for a meal or a dish, or for nothing in particular. */
export const shoppingItems = pgTable(
  "shopping_items",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Free text: "2", "500g", "1 pack". */
    qty: text("qty").notNull().default(""),
    dishId: text("dish_id").references(() => items.id, { onDelete: "set null" }),
    mealId: text("meal_id").references(() => meals.id, { onDelete: "set null" }),
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: text("done_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("shopping_group_idx").on(t.groupId, t.doneAt), index("shopping_meal_idx").on(t.mealId)],
);

/** A device's push token (FCM on Android, APNs on iOS) for group news. */
export const pushTokens = pgTable(
  "push_tokens",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    /** The device's language for the message text ("en", "ko"). */
    locale: text("locale").notNull().default("en"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_tokens_user_idx").on(t.userId)],
);

// ---- Board game module: BoardGameGeek details ----

/** What BGG says about a game (picture, players, time…), fetched by the server when a game gets a BGG link. */
export const gameDetails = pgTable("game_details", {
  itemId: text("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  bggId: integer("bgg_id").notNull(),
  year: integer("year"),
  /** BGG's own image URLs (shown from BGG's image server, not copied). */
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  minPlayers: integer("min_players"),
  maxPlayers: integer("max_players"),
  playingTime: integer("playing_time"),
  weight: doublePrecision("weight"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** BGG XML API answers, cached server-side as BGG asks (searches for a day, games for a week). */
export const bggCache = pgTable("bgg_cache", {
  key: text("key").primaryKey(),
  body: jsonb("body").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Board game module: who's coming ----

export const rsvpStatus = pgEnum("rsvp_status", ["going", "maybe", "no"]);

/** A member's answer for a night. Before it: coming or not; after it, "going" means they came. */
export const nightRsvps = pgTable(
  "night_rsvps",
  {
    nightId: text("night_id")
      .notNull()
      .references(() => meetupNights.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: rsvpStatus("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.nightId, t.userId] })],
);

/** People without the app who come along (by name). */
export const nightGuests = pgTable(
  "night_guests",
  {
    id: id(),
    nightId: text("night_id")
      .notNull()
      .references(() => meetupNights.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("night_guests_night_idx").on(t.nightId)],
);

// ---- Group chat ----

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    /** Deleted messages keep their place ("message deleted") with the text gone. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("chat_messages_group_idx").on(t.groupId, t.createdAt)],
);

// ---- Fitness module: each member's split routine and workouts (attendance) ----

/** A member's routine in a fitness group: days → exercises (sets, reps or seconds, weight, rest). */
export const fitnessRoutines = pgTable(
  "fitness_routines",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** RoutineDay[] (see @wanderbar/route fitness). Edited and read as a whole. */
    days: jsonb("days").$type<unknown[]>().notNull().default([]),
    /** Workouts a week I'm aiming for (the group's attendance board shows it). */
    weeklyGoal: integer("weekly_goal").notNull().default(3),
    unit: text("unit").notNull().default("kg"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fitness_routines_group_user_uq").on(t.groupId, t.userId)],
);

/**
 * One workout. Starting it is the check-in the group sees; the sets (weights, reps) are only the
 * member's own. The id comes from the phone, so a workout started offline syncs later as the same row.
 */
export const workouts = pgTable(
  "workouts",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dayId: text("day_id").notNull(),
    dayName: text("day_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** DoneSet[] — private to the member. */
    sets: jsonb("sets").$type<unknown[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workouts_group_started_idx").on(t.groupId, t.startedAt), index("workouts_user_started_idx").on(t.userId, t.startedAt)],
);

// ---- Real estate: houses (items of type "property") and open-house tours ----

/** A house's facts and where it is in our process. Facts are typed in or filled from the listing link. */
export const propertyDetails = pgTable(
  "property_details",
  {
    itemId: text("item_id")
      .primaryKey()
      .references(() => items.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    /** addressKey(address): one house per group. */
    addressKey: text("address_key").notNull(),
    city: text("city").notNull().default(""),
    zip: text("zip").notNull().default(""),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    googlePlaceId: text("google_place_id"),
    /** Whole dollars (the group's currency). */
    price: integer("price"),
    beds: doublePrecision("beds"),
    baths: doublePrecision("baths"),
    sqft: integer("sqft"),
    lotSqft: integer("lot_sqft"),
    yearBuilt: integer("year_built"),
    hoaMonthly: integer("hoa_monthly"),
    /** interested / to_tour / toured / considering / offered / contract / rejected (shared by the group). */
    stage: text("stage").notNull().default("interested"),
    rejectReason: text("reject_reason").notNull().default(""),
    /** Free text, e.g. "Sun 1–4pm". */
    openHouse: text("open_house").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("property_details_group_address_uq").on(t.groupId, t.addressKey)],
);

/** One member's record of one visit: scores, checks, notes per room, overall 1–10, pros and cons. */
export const tours = pgTable(
  "tours",
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
    visitedOn: date("visited_on").notNull(),
    /** 1–10, null until given. */
    overall: integer("overall"),
    /** again / once / reject */
    quick: text("quick"),
    scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
    checks: jsonb("checks").$type<Record<string, boolean>>().notNull().default({}),
    roomNotes: jsonb("room_notes").$type<Record<string, string>>().notNull().default({}),
    pros: text("pros").notNull().default(""),
    cons: text("cons").notNull().default(""),
    /** Listing agent met at the open house (name, phone). */
    agent: text("agent").notNull().default(""),
    /** What we heard there (offer deadline, how many offers…). */
    heard: text("heard").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tours_item_idx").on(t.itemId, t.visitedOn), index("tours_group_idx").on(t.groupId)],
);
