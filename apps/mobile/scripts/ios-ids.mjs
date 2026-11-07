// Finds the ids the iOS build needs, so nobody has to copy them by hand:
// - Expo account name and the "wanderbar" project id (creating the project on first run), via EXPO_TOKEN;
// - the App Store Connect app's Apple ID for app.wanderbar.mobile, via the App Store Connect API key.
// Writes them into app.config.ts / eas.json in the CI checkout and prints them (they are not secrets).
// Env: EXPO_TOKEN, EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const BUNDLE_ID = "app.wanderbar.mobile";
const SLUG = "wanderbar";

async function expo(query, variables = {}) {
  const res = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.EXPO_TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors?.length) throw new Error(`Expo API: ${body.errors.map((e) => e.message).join("; ")}`);
  return body.data;
}

async function expoProject() {
  const me = await expo(`{ meActor { __typename ... on User { username primaryAccount { id name } } ... on Robot { accounts { id name } } } }`);
  const account = me.meActor.primaryAccount ?? me.meActor.accounts?.[0];
  if (!account) throw new Error("Expo token has no account");
  const owner = account.name;
  const found = await expo(`query ($n: String!) { app { byFullName(fullName: $n) { id } } }`, { n: `@${owner}/${SLUG}` }).catch(() => null);
  if (found?.app?.byFullName?.id) return { owner, projectId: found.app.byFullName.id };
  const made = await expo(`mutation ($i: AppInput!) { app { createApp(appInput: $i) { id } } }`, {
    i: { accountId: account.id, projectName: SLUG, privacy: "UNLISTED" },
  });
  return { owner, projectId: made.app.createApp.id };
}

function ascToken() {
  const b64url = (b) => Buffer.from(b).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: process.env.EXPO_ASC_KEY_ID, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: process.env.EXPO_ASC_ISSUER_ID, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }));
  const key = createPrivateKey(readFileSync(process.env.EXPO_ASC_API_KEY_PATH));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}

async function ascAppId() {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${BUNDLE_ID}&fields[apps]=bundleId,name`, {
    headers: { authorization: `Bearer ${ascToken()}` },
  });
  if (!res.ok) throw new Error(`App Store Connect API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const { data } = await res.json();
  const app = data.find((a) => a.attributes.bundleId === BUNDLE_ID);
  if (!app) throw new Error(`No app with bundle ID ${BUNDLE_ID} in App Store Connect yet. Create it there (Apps → + → New App) and run again.`);
  return app.id;
}

const { owner, projectId } = await expoProject();
const appId = await ascAppId();

const config = "app.config.ts";
writeFileSync(config, readFileSync(config, "utf8").replace("REPLACE_WITH_EAS_PROJECT_ID", projectId).replace("REPLACE_WITH_EXPO_USERNAME", owner));
const eas = "eas.json";
writeFileSync(eas, readFileSync(eas, "utf8").replace("REPLACE_WITH_APP_STORE_CONNECT_APPLE_ID", appId));
console.log(`Expo owner: ${owner}\nExpo project id: ${projectId}\nApp Store Connect app id: ${appId}`);
