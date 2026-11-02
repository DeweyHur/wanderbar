import { z } from "zod";
import { autocomplete } from "@/lib/google";
import { authed, json } from "@/lib/http";

const Body = z.object({
  input: z.string().min(1).max(200),
  /** One token per search-and-pick (Google bills autocomplete + details as one session). */
  sessionToken: z.string().min(8).max(100),
  near: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().default(null),
});

export const POST = authed(async (req) => {
  const { input, sessionToken, near } = Body.parse(await req.json());
  return json({ suggestions: await autocomplete(input, sessionToken, near) });
});
