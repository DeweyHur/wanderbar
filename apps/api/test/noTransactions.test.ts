import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

// Production talks to Neon over HTTP (drizzle-orm/neon-http), which has no transactions:
// db.transaction() passes the PGlite tests but throws on Vercel. Insert in order instead.
it("server code never calls db.transaction()", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f)) files.push(p);
    }
  };
  walk(path.join(__dirname, "..", "src"));
  const offenders = files.filter((f) => /\.transaction\(/.test(readFileSync(f, "utf8")));
  expect(offenders).toEqual([]);
});
