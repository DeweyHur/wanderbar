import { z } from "zod";
import { authed, json } from "@/lib/http";
import { deleteTrip, getTrip, updateTrip } from "@/lib/trips";

export const GET = authed<{ tripId: string }>(async (_req, { db, user, params }) => json(await getTrip(db, params.tripId, user.id)));

const Patch = z.object({
  title: z.string().max(80).optional(),
  startDate: z.string().max(10).optional(),
  endDate: z.string().max(10).optional(),
  transport: z.enum(["car", "flight", "train", "bus", "other"]).optional(),
  rentalCar: z.boolean().optional(),
});

export const PATCH = authed<{ tripId: string }>(async (req, { db, user, params }) =>
  json(await updateTrip(db, params.tripId, user.id, Patch.parse(await req.json()))),
);

export const DELETE = authed<{ tripId: string }>(async (_req, { db, user, params }) => {
  await deleteTrip(db, params.tripId, user.id);
  return json({ ok: true });
});
