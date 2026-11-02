// Applies drizzle/ migrations over Neon's HTTPS driver, so it works where only HTTP egress is allowed
// (drizzle-kit migrate needs a raw Postgres TCP connection).
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (put it in apps/api/.env.local)");
  process.exit(1);
}
await migrate(drizzle(neon(url)), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
const tables = await neon(url)`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
console.log("migrated. tables:", tables.map((t) => t.table_name).join(", "));
