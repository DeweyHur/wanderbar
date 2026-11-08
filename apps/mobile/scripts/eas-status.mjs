// Prints why the latest iOS build or TestFlight submission ended (EAS doesn't say in the CLI). Env: EXPO_TOKEN.
const q = async (query, variables) => {
  const r = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.EXPO_TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  return (await r.json()).data;
};
const id = "36e32811-cb27-4d29-855d-1e4d8651f7a4";
const d = await q(
  `query ($id: String!) { app { byId(appId: $id) {
    builds(offset: 0, limit: 2, filter: { platform: IOS }) { id status buildNumber error { errorCode message } }
    submissions(offset: 0, limit: 2, filter: { platform: IOS }) { id status error { errorCode message } logsUrl }
  } } }`,
  { id },
);
console.log(JSON.stringify(d?.app?.byId ?? d, null, 2));
const logs = d?.app?.byId?.submissions?.[0]?.logsUrl;
if (logs) {
  const t = await (await fetch(logs)).text();
  console.log(t.split("\n").map((l) => { try { return JSON.parse(l).msg; } catch { return l; } }).filter(Boolean).slice(-40).join("\n"));
}
