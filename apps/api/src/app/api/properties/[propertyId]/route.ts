import { deleteProperty, getProperty, PropertyEditBody, updateProperty } from "@/lib/realestate";
import { authed, json } from "@/lib/http";

export const GET = authed<{ propertyId: string }>(async (_req, { db, user, params }) => json(await getProperty(db, params.propertyId, user.id)));

export const PATCH = authed<{ propertyId: string }>(async (req, { db, user, params }) =>
  json(await updateProperty(db, params.propertyId, user.id, PropertyEditBody.parse(await req.json()))),
);

export const DELETE = authed<{ propertyId: string }>(async (_req, { db, user, params }) => json(await deleteProperty(db, params.propertyId, user.id)));
