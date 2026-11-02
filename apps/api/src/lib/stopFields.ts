import { z } from "zod";

/** Editable stop fields as accepted from clients. */
export const StopFieldsSchema = z.object({
  name: z.string().max(200).optional(),
  memo: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
  mapsUrl: z.string().max(2000).optional(),
  yelpUrl: z.string().max(2000).optional(),
  hoursRaw: z.string().max(1000).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  googlePlaceId: z.string().max(300).optional(),
  /** A saved restaurant of the same group. */
  itemId: z.string().max(100).nullable().optional(),
});
