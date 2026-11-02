/**
 * iOS's share extension opens the app with wanderbar://dataUrl=<key>#<type>; send that to the share
 * screen instead of letting the router treat it as an unknown path.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (path.includes("dataUrl=")) return "/share";
  return path;
}
