import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";

/** Fresh in-memory Postgres with the real migrations applied. */
export async function testDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as Db;
}

let n = 0;
export const profile = (name: string) => ({
  sub: `sub-${name}-${++n}`,
  email: `${name}@example.com`,
  name,
  picture: null,
});
