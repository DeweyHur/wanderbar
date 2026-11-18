import { z } from "zod";
import { authed, json } from "@/lib/http";
import { addHotel } from "@/lib/trips";

export const HotelBody = z.object({
  name: z.string().max(200),
  address: z.string().max(500).optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  googlePlaceId: z.string().max(300).optional(),
  mapsUrl: z.string().max(1000).optional(),
  checkIn: z.string().max(10),
  checkOut: z.string().max(10),
});

/** A hotel stay: the nights from checkIn up to checkOut. */
export const POST = authed<{ tripId: string }>(async (req, { db, user, params }) =>
  json(await addHotel(db, params.tripId, user.id, HotelBody.parse(await req.json())), 201),
);
