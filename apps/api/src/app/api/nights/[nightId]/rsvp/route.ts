import { z } from "zod";
import { setRsvp } from "@/lib/boardgame";
import { authed, json } from "@/lib/http";

const Body = z.object({ status: z.enum(["going", "maybe", "no"]).nullable(), userId: z.string().max(64).optional() });

/** Going / maybe / can't (null clears). The owner, hosts and the picker can set others', e.g. who actually came. */
export const PUT = authed<{ nightId: string }>(async (req, { db, user, params }) => json(await setRsvp(db, params.nightId, user.id, Body.parse(await req.json()))));
