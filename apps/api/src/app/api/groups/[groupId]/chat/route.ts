import { z } from "zod";
import { listMessages, sendMessage } from "@/lib/chat";
import { authed, json } from "@/lib/http";

const time = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined);

/** Latest messages (?before= for older, ?after= for new ones while open). Opening marks the chat read. */
export const GET = authed<{ groupId: string }>(async (req, { db, user, params }) => {
  const q = new URL(req.url).searchParams;
  return json(await listMessages(db, params.groupId, user.id, { after: time(q.get("after")), before: time(q.get("before")) }));
});

const Body = z.object({ body: z.string().max(4000) });

export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) =>
  json(await sendMessage(db, params.groupId, user.id, Body.parse(await req.json()).body), 201),
);
