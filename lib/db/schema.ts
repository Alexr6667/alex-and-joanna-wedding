import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Application tables live in the public schema. Neon Auth owns the separate
// neon_auth schema; drizzle.config.ts filters it out so Drizzle never manages it.

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Small key/value table for app-level settings. Also lets the admin page confirm migrations have run. */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Site settings and content
// ---------------------------------------------------------------------------

export const siteAccessMode = pgEnum("site_access_mode", ["private", "public"]);

/**
 * One row (id = 1). Scalar settings are columns. Page copy lives in `content`,
 * validated by lib/settings/schema.ts and merged over the typed defaults in
 * lib/settings/defaults.ts, so an empty object renders the placeholders.
 */
export const siteSettings = pgTable(
  "site_settings",
  {
    id: smallint("id").primaryKey().default(1),
    accessMode: siteAccessMode("access_mode").notNull().default("private"),
    // A calendar date in Europe/London. Guests can edit up to the end of that day.
    rsvpDeadline: date("rsvp_deadline", { mode: "string" }),
    menuEnabled: boolean("menu_enabled").notNull().default(false),
    askDietary: boolean("ask_dietary").notNull().default(true),
    askSongRequest: boolean("ask_song_request").notNull().default(true),
    askNotes: boolean("ask_notes").notNull().default(true),
    // Null means "use the default template".
    whatsappTemplate: text("whatsapp_template"),
    content: jsonb("content").notNull().default({}),
    updatedAt: updatedAt(),
  },
  (t) => [check("site_settings_singleton", sql`${t.id} = 1`)],
);

export const faqEntries = pgTable("faq_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export const menuCategoryKey = pgEnum("menu_category_key", [
  "arrival_drink",
  "starter",
  "main",
  "dessert",
]);

export const menuCategories = pgTable("menu_categories", {
  key: menuCategoryKey("key").primaryKey(),
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  updatedAt: updatedAt(),
});

export const menuOptions = pgTable(
  "menu_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: menuCategoryKey("category")
      .notNull()
      .references(() => menuCategories.key, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("menu_options_category_idx").on(t.category, t.displayOrder)],
);

// ---------------------------------------------------------------------------
// Guests
// ---------------------------------------------------------------------------

/** Admin-only grouping. Has no effect on invitation access or RSVPs. */
export const familyGroups = pgTable(
  "family_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("family_groups_name_lower_idx").on(sql`lower(${t.name})`)],
);

export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    familyGroupId: uuid("family_group_id").references(() => familyGroups.id, {
      onDelete: "set null",
    }),
    plusOneAllowed: boolean("plus_one_allowed").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // SHA-256 of the invitation token. The raw token is never stored. Null
    // until an admin generates the first link.
    invitationTokenHash: text("invitation_token_hash"),
    invitationTokenCreatedAt: timestamp("invitation_token_created_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("guests_invitation_token_hash_idx").on(t.invitationTokenHash),
    index("guests_family_group_idx").on(t.familyGroupId),
  ],
);

/**
 * Browser sessions created by exchanging an invitation link. The cookie holds a
 * random value; only its SHA-256 is stored here.
 */
export const guestSessions = pgTable(
  "guest_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("guest_sessions_token_hash_idx").on(t.tokenHash),
    index("guest_sessions_guest_idx").on(t.guestId),
  ],
);

// ---------------------------------------------------------------------------
// RSVPs
// ---------------------------------------------------------------------------

export const rsvpUpdatedBy = pgEnum("rsvp_updated_by", ["guest", "admin"]);

/** One response per invited guest. */
export const rsvps = pgTable("rsvps", {
  guestId: uuid("guest_id")
    .primaryKey()
    .references(() => guests.id, { onDelete: "cascade" }),
  attending: boolean("attending").notNull(),
  bringingPlusOne: boolean("bringing_plus_one").notNull().default(false),
  songRequest: text("song_request"),
  notes: text("notes"),
  respondedAt: timestamp("responded_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: updatedAt(),
  updatedBy: rsvpUpdatedBy("updated_by").notNull().default("guest"),
});

export const attendeeRole = pgEnum("attendee_role", ["guest", "plus_one"]);

/**
 * The people covered by an RSVP: the invited guest and, if allowed and
 * brought, their plus-one. Each has their own dietary needs and menu choices.
 */
export const rsvpAttendees = pgTable(
  "rsvp_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => rsvps.guestId, { onDelete: "cascade" }),
    role: attendeeRole("role").notNull(),
    // Plus-one's name. Null for the invited guest, whose name is on `guests`.
    fullName: text("full_name"),
    dietaryRequirements: text("dietary_requirements"),
    arrivalDrinkOptionId: uuid("arrival_drink_option_id").references(() => menuOptions.id, {
      onDelete: "restrict",
    }),
    starterOptionId: uuid("starter_option_id").references(() => menuOptions.id, {
      onDelete: "restrict",
    }),
    mainOptionId: uuid("main_option_id").references(() => menuOptions.id, {
      onDelete: "restrict",
    }),
    dessertOptionId: uuid("dessert_option_id").references(() => menuOptions.id, {
      onDelete: "restrict",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("rsvp_attendees_guest_role_idx").on(t.guestId, t.role)],
);

// ---------------------------------------------------------------------------
// CSV imports
// ---------------------------------------------------------------------------

/** Records each committed import so the same file cannot be imported twice. */
export const guestImports = pgTable(
  "guest_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileSha256: text("file_sha256").notNull(),
    rowCount: integer("row_count").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("guest_imports_file_sha256_idx").on(t.fileSha256)],
);

/**
 * A checked CSV file waiting for the admin to confirm it. Created by "Check
 * file", used up by a successful import. Confirming needs a row that matches
 * the signed-in admin and the exact file contents, so an import can't skip
 * the preview or swap the file afterwards. Stored in the database rather than
 * in memory because each request may run on a different server instance.
 */
export const guestImportPreviews = pgTable(
  "guest_import_previews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Lower-cased email of the admin who checked the file.
    adminEmail: text("admin_email").notNull(),
    fileSha256: text("file_sha256").notNull(),
    // Lines the preview flagged as possible duplicates. An acknowledgement
    // covers only these.
    duplicateLines: integer("duplicate_lines").array().notNull().default(sql`'{}'::integer[]`),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("guest_import_previews_expires_at_idx").on(t.expiresAt)],
);
