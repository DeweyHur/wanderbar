import { usZip } from "@wanderbar/route";
import { z } from "zod";
import { badRequest } from "@/lib/errors";
import { zipCenter } from "@/lib/google";
import { authed, json } from "@/lib/http";

/** The center of a US ZIP code, so place search can lean toward it and measure distances from it. */
export const POST = authed(async (req) => {
  const zip = usZip(z.object({ zip: z.string().max(20) }).parse(await req.json()).zip);
  if (!zip) throw badRequest("places.zip_invalid");
  return json({ zip, ...(await zipCenter(zip)) });
});
