import { z } from "zod";
import { authed, json } from "@/lib/http";
import { placeFromLink } from "@/lib/placeLink";

const Body = z.object({ url: z.string().max(2000), name: z.string().max(200).default("") });

/** POST { url, name }: what a shared Google Maps link points at (address, location, hours), or null. */
export const POST = authed(async (req) => {
  const { url, name } = Body.parse(await req.json());
  return json({ place: await placeFromLink(url, name) });
});
