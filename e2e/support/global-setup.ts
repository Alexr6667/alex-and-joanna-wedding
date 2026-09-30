import { execFileSync } from "node:child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { TEST_DATABASE_URL, TEST_DB_PORT } from "./test-env";

const CONTAINER = "wedding-e2e-postgres";

async function canConnect(): Promise<boolean> {
  const client = new Client({ connectionString: TEST_DATABASE_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

/** Starts a disposable Postgres in Docker when running locally and none is listening. */
function startLocalPostgres() {
  const existing = execFileSync("docker", ["ps", "-a", "--filter", `name=^${CONTAINER}$`, "--format", "{{.Status}}"], {
    encoding: "utf8",
  }).trim();
  if (existing.startsWith("Up")) return;
  if (existing) {
    execFileSync("docker", ["start", CONTAINER], { stdio: "ignore" });
    return;
  }
  execFileSync(
    "docker",
    [
      "run", "-d", "--rm", "--name", CONTAINER,
      "-p", `127.0.0.1:${TEST_DB_PORT}:5432`,
      "-e", "POSTGRES_PASSWORD=postgres",
      "-e", "POSTGRES_DB=wedding_e2e",
      "--tmpfs", "/var/lib/postgresql/data",
      "postgres:17-alpine",
    ],
    { stdio: "ignore" },
  );
}

export default async function globalSetup() {
  if (!(await canConnect())) {
    if (process.env.CI) throw new Error(`E2E database is not reachable on port ${TEST_DB_PORT}`);
    startLocalPostgres();
    const deadline = Date.now() + 60_000;
    while (!(await canConnect())) {
      if (Date.now() > deadline) throw new Error("Timed out waiting for the E2E Postgres container");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Fresh schema every run, then the real migrations, exactly as they run on Neon.
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}
