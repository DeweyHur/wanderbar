// Fails when a dependency of the mobile app needs a native peer (a package with android/ or ios/ code) that the
// app doesn't list itself. Autolinking only links the app's own dependencies, so such a peer is in the JS
// bundle but not in the APK, and the app crashes when it's used (react-native-keyboard-controller needed
// react-native-reanimated, which only came in through expo-router, and crashed signed-in screens).
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const app = path.resolve("apps/mobile");
const pkg = JSON.parse(readFileSync(path.join(app, "package.json"), "utf8"));
const deps = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
const require = createRequire(path.join(app, "package.json"));
const dirOf = (name) => {
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch {
    return null;
  }
};
// Expo modules (expo-module.config.json) are found by Expo's autolinking even when transitive; React Native
// community packages are only linked when the app lists them.
const isNative = (dir) => ["android", "ios"].some((d) => existsSync(path.join(dir, d))) && !existsSync(path.join(dir, "expo-module.config.json"));
// Peers that are optional for the package itself (declared in peerDependenciesMeta) are skipped.
const problems = [];
for (const name of pkg.dependencies ? Object.keys(pkg.dependencies) : []) {
  const dir = dirOf(name);
  if (!dir) continue;
  const p = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  for (const peer of Object.keys(p.peerDependencies ?? {})) {
    if (deps.has(peer) || p.peerDependenciesMeta?.[peer]?.optional) continue;
    const peerDir = dirOf(peer);
    if (peerDir && isNative(peerDir) && !["react", "react-native"].includes(peer)) problems.push(`${name} needs native ${peer}`);
  }
}
if (problems.length) {
  console.error(`Native peers missing from apps/mobile/package.json (they won't be linked into the app):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("native peers ok");
