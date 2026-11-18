import { z } from "zod";
import { authed, json } from "@/lib/http";
import { createTrip, listTrips } from "@/lib/trips";

export const GET = authed<{ groupId: string }>(async (_req, { db, user, params }) =>
  json({ trips: await listTrips(db, params.groupId, user.id) }),
);

export const Transport = z.enum(["car", "flight", "train", "bus", "other"]);
const Body = z.object({
  title: z.string().max(80).optional(),
  startDate: z.string().max(10),
  endDate: z.string().max(10),
  transport: Transport.optional(),
  rentalCar: z.boolean().optional(),
});

/** A trip: { startDate, endDate, transport, rentalCar }; a day route is made for each day. */
export const POST = authed<{ groupId: string }>(async (req, { db, user, params }) =>
  json(await createTrip(db, params.groupId, user.id, Body.parse(await req.json())), 201),
);
