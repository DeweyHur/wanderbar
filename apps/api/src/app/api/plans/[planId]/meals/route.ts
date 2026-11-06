import { z } from "zod";
import { authed, json } from "@/lib/http";
import { addMeal, listMeals } from "@/lib/meals";

/** Lunch and dinner on a day at home, each with what to buy for it. */
export const GET = authed<{ planId: string }>(async (_req, { db, user, params }) => json({ meals: await listMeals(db, params.planId, user.id) }));

const Body = z.object({ slot: z.enum(["lunch", "dinner"]), dishId: z.string().max(64).nullable().optional(), title: z.string().max(200).optional() });

export const POST = authed<{ planId: string }>(async (req, { db, user, params }) =>
  json({ meals: await addMeal(db, params.planId, user.id, Body.parse(await req.json())) }, 201),
);
