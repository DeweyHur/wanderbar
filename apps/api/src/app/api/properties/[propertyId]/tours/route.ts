import { createTour, TourBody } from "@/lib/realestate";
import { authed, json } from "@/lib/http";

/** Start my record of a visit to this house. */
export const POST = authed<{ propertyId: string }>(async (req, { db, user, params }) =>
  json(await createTour(db, params.propertyId, user.id, TourBody.parse(await req.json().catch(() => ({})))), 201),
);
