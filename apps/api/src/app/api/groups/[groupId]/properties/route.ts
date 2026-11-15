import { createProperty, listProperties, NewPropertyBody } from "@/lib/realestate";
import { authed, json } from "@/lib/http";

/** The group's houses (real-estate module). */
export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) => json({ properties: await listProperties(db, params.groupId, user.id) }));

/** Save a house from a listing link, a Google place or a typed address. Same address = the existing house (created: false). */
export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) => {
  const r = await createProperty(db, params.groupId, user.id, NewPropertyBody.parse(await req.json()));
  return json(r, r.created ? 201 : 200);
});
