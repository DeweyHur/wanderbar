import { TESLA_FORMATS } from "@wanderbar/route";
import { z } from "zod";
import { authed, json } from "@/lib/http";
import { getTeslaFormat, setTeslaFormat } from "@/lib/plans";

const Platform = z.enum(["android", "ios"]);

/** The Tesla text format this user confirmed works on this phone platform (null = not tested yet). */
export const GET = authed(async (req, { db, user }) => {
  const platform = Platform.parse(new URL(req.url).searchParams.get("platform"));
  return json({ format: await getTeslaFormat(db, user.id, platform) });
});

const Body = z.object({ platform: Platform, format: z.enum(TESLA_FORMATS) });

export const PUT = authed(async (req, { db, user }) => {
  const { platform, format } = Body.parse(await req.json());
  return json({ format: await setTeslaFormat(db, user.id, platform, format) });
});
