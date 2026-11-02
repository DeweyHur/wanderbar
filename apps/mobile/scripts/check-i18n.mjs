// Fails if English and Korean translation files don't have the same keys.
// Plural forms differ by language (English: _one/_other, Korean: _other only), so plural suffixes are folded.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/", import.meta.url).pathname;
const LANGS = ["en", "ko"];
const PLURAL = /_(zero|one|two|few|many|other)$/;

const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`.replace(PLURAL, "")],
  );

// namespace -> { lang -> file }
const sets = { core: Object.fromEntries(LANGS.map((l) => [l, join(root, "locales", l, "core.json")])) };
for (const mod of readdirSync(join(root, "modules"))) {
  const dir = join(root, "modules", mod, "locales");
  if (existsSync(dir)) sets[mod] = Object.fromEntries(LANGS.map((l) => [l, join(dir, `${l}.json`)]));
}

let failed = false;
for (const [ns, files] of Object.entries(sets)) {
  const keys = Object.fromEntries(LANGS.map((l) => [l, new Set(flatten(JSON.parse(readFileSync(files[l], "utf8"))))]));
  for (const a of LANGS)
    for (const b of LANGS) {
      if (a === b) continue;
      const missing = [...keys[a]].filter((k) => !keys[b].has(k));
      if (missing.length) {
        failed = true;
        console.error(`[${ns}] missing in ${b}: ${missing.join(", ")}`);
      }
    }
  console.log(`[${ns}] ${keys.en.size} keys`);
}
process.exit(failed ? 1 : 0);
