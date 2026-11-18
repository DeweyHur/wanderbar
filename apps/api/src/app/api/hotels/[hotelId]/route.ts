import { z } from "zod";
import { authed, json } from "@/lib/http";
import { deleteHotel, updateHotel } from "@/lib/trips";

const Patch = z.object({
  name: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  googlePlaceId: z.string().max(300).optional(),
  mapsUrl: z.string().max(1000).optional(),
  checkIn: z.string().max(10).optional(),
  checkOut: z.string().max(10).optional(),
});

export const PATCH = authed<{ hotelId: string }>(async (req, { db, user, params }) =>
  json(await updateHotel(db, params.hotelId, user.id, Patch.parse(await req.json()))),
);

export const DELETE = authed<{ hotelId: string }>(async (_req, { db, user, params }) =>
  json(await deleteHotel(db, params.hotelId, user.id)),
);
