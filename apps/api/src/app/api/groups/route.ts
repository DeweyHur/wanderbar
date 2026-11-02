import { z } from "zod";
import { createGroup } from "@/lib/groups";
import { authed, json } from "@/lib/http";

const Body = z.object({ name: z.string().min(1).max(60) });

export const POST = authed(async (req, { db, user }) => {
  const { name } = Body.parse(await req.json());
  return json(await createGroup(db, user.id, name), 201);
});
