// Writes the App Store Connect API key (secret ASC_API_KEY_P8 as the .p8 text, or ASC_KEY_P8_BASE64 as base64
// of the text or of the binary key) to the path given, and points eas.json's TestFlight submit at it.
// Env: ASC_API_KEY_P8 / ASC_KEY_P8_BASE64, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID.
import { readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/asc-setup.mjs <key path>");
const raw = (process.env.ASC_API_KEY_P8 || process.env.ASC_KEY_P8_BASE64 || "").trim();
let pem = raw.includes("BEGIN PRIVATE KEY") ? raw : Buffer.from(raw.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
if (!pem.includes("BEGIN PRIVATE KEY")) {
  const der = Buffer.from(raw.replace(/\s+/g, ""), "base64");
  // base64 of the binary (DER) key rather than of the .p8 text
  if (der[0] === 0x30) pem = "-----BEGIN PRIVATE KEY-----\n" + der.toString("base64").match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----";
  else pem = Buffer.from(pem.replace(/\s+/g, ""), "base64").toString("utf8");
}
if (!pem.includes("BEGIN PRIVATE KEY")) {
  console.error("::error::The App Store Connect key is not a .p8 private key (or base64 of one)");
  process.exit(1);
}
writeFileSync(out, pem.trim() + "\n");

// The TestFlight upload uses the same key (EAS won't store one for submit non-interactively).
const j = JSON.parse(readFileSync("eas.json", "utf8"));
Object.assign(j.submit.production.ios, { ascApiKeyPath: out, ascApiKeyIssuerId: process.env.EXPO_ASC_ISSUER_ID, ascApiKeyId: process.env.EXPO_ASC_KEY_ID });
writeFileSync("eas.json", JSON.stringify(j, null, 2));
