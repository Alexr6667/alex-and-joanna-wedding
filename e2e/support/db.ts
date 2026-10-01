import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { TEST_DATABASE_URL } from "./test-env";

// Test fixtures write straight to the throwaway E2E database. None of this
// runs against Neon, and none of it ships with the app.
const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/** Empties every application table and restores the seeded defaults. */
export async function resetDatabase() {
  await sql(`
    truncate guest_sessions, rsvp_attendees, rsvps, guests, family_groups, guest_imports, guest_import_previews, faq_entries, menu_options cascade;
    update site_settings set access_mode = 'private', rsvp_deadline = null, menu_enabled = false,
      ask_dietary = true, ask_song_request = true, ask_notes = true, whatsapp_template = null, content = '{}';
    update menu_categories set enabled = true, label = case key
      when 'arrival_drink' then 'Arrival drink' when 'starter' then 'Starter'
      when 'main' then 'Main' when 'dessert' then 'Dessert' end;
  `);
}

export function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export type TestGuest = { id: string; token: string; firstName: string; lastName: string };

export async function createGuest(
  options: {
    firstName?: string;
    lastName?: string;
    plusOneAllowed?: boolean;
    familyGroupId?: string | null;
    archived?: boolean;
  } = {},
): Promise<TestGuest> {
  const firstName = options.firstName ?? "James";
  const lastName = options.lastName ?? "Smith";
  const { token, hash } = newToken();
  const [row] = await sql<{ id: string }>(
    `insert into guests (first_name, last_name, plus_one_allowed, family_group_id, archived_at,
       invitation_token_hash, invitation_token_created_at)
     values ($1, $2, $3, $4, $5, $6, now()) returning id`,
    [
      firstName,
      lastName,
      options.plusOneAllowed ?? false,
      options.familyGroupId ?? null,
      options.archived ? new Date() : null,
      hash,
    ],
  );
  return { id: row.id, token, firstName, lastName };
}

export async function createFamilyGroup(name: string): Promise<string> {
  const [row] = await sql<{ id: string }>("insert into family_groups (name) values ($1) returning id", [name]);
  return row.id;
}

export async function updateSettings(values: {
  accessMode?: "private" | "public";
  rsvpDeadline?: string | null;
  menuEnabled?: boolean;
}) {
  if (values.accessMode) await sql("update site_settings set access_mode = $1", [values.accessMode]);
  if (values.rsvpDeadline !== undefined) await sql("update site_settings set rsvp_deadline = $1", [values.rsvpDeadline]);
  if (values.menuEnabled !== undefined) await sql("update site_settings set menu_enabled = $1", [values.menuEnabled]);
}

export async function addMenuOption(
  category: "arrival_drink" | "starter" | "main" | "dessert",
  name: string,
  displayOrder = 1,
  active = true,
): Promise<string> {
  const [row] = await sql<{ id: string }>(
    "insert into menu_options (category, name, display_order, active) values ($1, $2, $3, $4) returning id",
    [category, name, displayOrder, active],
  );
  return row.id;
}

export async function getRsvp(guestId: string) {
  const [rsvp] = await sql<{
    attending: boolean;
    bringing_plus_one: boolean;
    notes: string | null;
    song_request: string | null;
    updated_by: string;
  }>("select * from rsvps where guest_id = $1", [guestId]);
  const attendees = await sql<{
    role: string;
    full_name: string | null;
    dietary_requirements: string | null;
    arrival_drink_option_id: string | null;
    starter_option_id: string | null;
    main_option_id: string | null;
    dessert_option_id: string | null;
  }>("select * from rsvp_attendees where guest_id = $1 order by role", [guestId]);
  return { rsvp, attendees };
}

export async function saveRsvp(guestId: string, attending: boolean, bringingPlusOne = false, plusOneName?: string) {
  await sql(
    `insert into rsvps (guest_id, attending, bringing_plus_one) values ($1, $2, $3)
     on conflict (guest_id) do update set attending = $2, bringing_plus_one = $3`,
    [guestId, attending, bringingPlusOne],
  );
  await sql("insert into rsvp_attendees (guest_id, role) values ($1, 'guest') on conflict do nothing", [guestId]);
  if (plusOneName) {
    await sql("insert into rsvp_attendees (guest_id, role, full_name) values ($1, 'plus_one', $2)", [
      guestId,
      plusOneName,
    ]);
  }
}

export async function countGuestSessions(): Promise<number> {
  const [row] = await sql<{ n: string }>("select count(*) as n from guest_sessions");
  return Number(row.n);
}

export type HeldTransaction = {
  query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  /**
   * Waits until exactly `expected` other connections are blocked behind this
   * transaction's locks, either directly or behind another blocked
   * connection. Throws if that doesn't happen before the timeout, or if more
   * connections than expected are blocked.
   */
  waitForBlocked: (expected?: number, timeoutMs?: number) => Promise<void>;
  commit: () => Promise<void>;
  /** Rolls back if still open and returns the connection. Safe to call twice; call it in `finally`. */
  close: () => Promise<void>;
};

/**
 * Opens a transaction on its own connection, so a test can hold locks (as a
 * concurrent admin change would) while the app handles a request. Always
 * pair it with `close()` in a `finally` block, so a failed test can't leave
 * the transaction open and its locks held.
 */
export async function openTransaction(): Promise<HeldTransaction> {
  const client = await pool.connect();
  let pid: number;
  try {
    await client.query("begin");
    [{ pid }] = (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows;
  } catch (error) {
    client.release(error as Error);
    throw error;
  }

  let open = true;
  const finish = async (statement: "commit" | "rollback") => {
    if (!open) return;
    open = false;
    try {
      await client.query(statement);
      client.release();
    } catch (error) {
      // Discard the connection rather than return it to the pool mid-transaction.
      client.release(error as Error);
      throw error;
    }
  };

  return {
    query: async (text, params = []) => (await client.query(text, params)).rows,
    waitForBlocked: async (expected = 1, timeoutMs = 5000) => {
      const deadline = Date.now() + timeoutMs;
      let blocked = 0;
      while (Date.now() < deadline) {
        blocked = await countBlockedBehind(pid);
        if (blocked > expected) {
          throw new Error(`Expected ${expected} blocked connection(s), found ${blocked}.`);
        }
        if (blocked === expected) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Timed out waiting for ${expected} blocked connection(s); ${blocked} blocked.`);
    },
    commit: () => finish("commit"),
    close: () => finish("rollback"),
  };
}

/** Connections waiting on a lock held by `pid`, directly or through other waiting connections. */
async function countBlockedBehind(pid: number): Promise<number> {
  const [row] = await sql<{ n: number }>(
    `with recursive blocked(pid) as (
       select a.pid from pg_stat_activity a
       where a.datname = current_database() and $1::int = any(pg_blocking_pids(a.pid))
       union
       select a.pid from pg_stat_activity a join blocked b on b.pid = any(pg_blocking_pids(a.pid))
       where a.datname = current_database()
     )
     select count(*)::int as n from blocked`,
    [pid],
  );
  return row.n;
}
