import { removeLink } from "@/lib/realestate";
import { authed, json } from "@/lib/http";

export const DELETE = authed<{ propertyId: string; linkId: string }>(async (_req, { db, user, params }) => json(await removeLink(db, params.propertyId, params.linkId, user.id)));
