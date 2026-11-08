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
