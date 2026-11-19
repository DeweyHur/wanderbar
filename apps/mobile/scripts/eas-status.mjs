// Prints why the latest iOS build or TestFlight submission ended (EAS doesn't say in the CLI). Env: EXPO_TOKEN.
const q = async (query, variables) => {
  const r = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.EXPO_TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  const b = await r.json();
  if (b.errors) console.log("Expo API:", JSON.stringify(b.errors).slice(0, 800));
  return b.data;
};
const id = "36e32811-cb27-4d29-855d-1e4d8651f7a4";
const d = await q(
  `query ($id: String!) { app { byId(appId: $id) {
    builds(offset: 0, limit: 3, filter: { platform: IOS }) { id status appBuildVersion error { errorCode message } logFiles }
    submissions(offset: 0, limit: 2, filter: { platform: IOS }) { id status error { errorCode message } logFiles }
  } } }`,
  { id },
);
console.log(JSON.stringify(d?.app?.byId ?? d, null, 2));
const tail = async (urls, n) => {
  for (const u of urls ?? []) {
    const t = await (await fetch(u)).text();
    const lines = t.split("\n").map((l) => { try { return JSON.parse(l).msg; } catch { return l; } }).filter(Boolean);
    console.log(`--- ${u.split("?")[0].split("/").pop()}\n` + lines.slice(-n).join("\n"));
  }
};
const app = d?.app?.byId;
if (app?.builds?.[0]?.status === "ERRORED") await tail(app.builds[0].logFiles, 60);
if (app?.submissions?.[0]?.status === "ERRORED") await tail(app.submissions[0].logFiles, 40);

// Apple's side: the newest TestFlight builds and whether Apple has finished processing them (VALID = installable).
if (process.env.EXPO_ASC_API_KEY_PATH && process.env.EXPO_ASC_KEY_ID && process.env.EXPO_ASC_ISSUER_ID) {
  const { createPrivateKey, sign } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  const b64url = (b) => Buffer.from(b).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: process.env.EXPO_ASC_KEY_ID, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: process.env.EXPO_ASC_ISSUER_ID, iat: now, exp: now + 600, aud: "appstoreconnect-v1" }));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key: createPrivateKey(readFileSync(process.env.EXPO_ASC_API_KEY_PATH)), dsaEncoding: "ieee-p1363" });
  const r = await fetch("https://api.appstoreconnect.apple.com/v1/builds?filter[app]=6831952410&sort=-uploadedDate&limit=3&fields[builds]=version,processingState,uploadedDate,expired&include=preReleaseVersion&fields[preReleaseVersions]=version", {
    headers: { authorization: `Bearer ${head}.${body}.${b64url(sig)}` },
  });
  const j = await r.json();
  const versions = Object.fromEntries((j.included ?? []).map((v) => [v.id, v.attributes.version]));
  for (const b of j.data ?? [])
    console.log(`TestFlight build ${versions[b.relationships?.preReleaseVersion?.data?.id] ?? "?"} (${b.attributes.version}): ${b.attributes.processingState} · uploaded ${b.attributes.uploadedDate}`);
  if (!r.ok) console.log("App Store Connect:", r.status, JSON.stringify(j).slice(0, 300));
}
