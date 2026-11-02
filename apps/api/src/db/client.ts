import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/** Any Postgres-backed Drizzle database with our schema (Neon in production, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: Promise<Db> | undefined;

/** True when the server runs on a throwaway in-memory database (end-to-end tests). */
export const isInMemoryDb = () => (process.env.DATABASE_URL ?? "").startsWith("pglite:");

/**
 * Production: Neon over HTTPS. End-to-end tests: DATABASE_URL=pglite:memory gives an in-memory Postgres
 * (PGlite) with the real migrations applied, so the full web app + API run with no external services.
 */
export function getDb(): Promise<Db> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (isInMemoryDb()) {
    cached = (async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      const { drizzle: pgliteDrizzle } = await import("drizzle-orm/pglite");
      const { migrate } = await import("drizzle-orm/pglite/migrator");
      const path = await import("node:path");
      const db = pgliteDrizzle(new PGlite(), { schema });
      await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
      return db as unknown as Db;
    })();
  } else {
    cached = Promise.resolve(drizzle(neon(url), { schema }) as unknown as Db);
  }
  return cached;
}
