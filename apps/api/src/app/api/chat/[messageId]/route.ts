import { deleteMessage } from "@/lib/chat";
import { authed, json } from "@/lib/http";

/** Delete your own message (or any, as the group owner). */
export const DELETE = authed<{ messageId: string }>(async (_req, { db, user, params }) => json(await deleteMessage(db, params.messageId, user.id)));
