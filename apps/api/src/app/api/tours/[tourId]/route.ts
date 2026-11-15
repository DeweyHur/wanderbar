import { deleteTour, tourOf, TourBody, updateTour } from "@/lib/realestate";
import { authed, json } from "@/lib/http";

export const GET = authed<{ tourId: string }>(async (_req, { db, user, params }) => json(await tourOf(db, params.tourId, user.id)));

/** My own tour only. */
export const PUT = authed<{ tourId: string }>(async (req, { db, user, params }) => json(await updateTour(db, params.tourId, user.id, TourBody.parse(await req.json()))));

export const DELETE = authed<{ tourId: string }>(async (_req, { db, user, params }) => json(await deleteTour(db, params.tourId, user.id)));
