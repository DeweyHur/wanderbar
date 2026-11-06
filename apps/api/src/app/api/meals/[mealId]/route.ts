import { authed, json } from "@/lib/http";
import { deleteMeal } from "@/lib/meals";

/** Removes a meal (and what was still to buy for it); returns the day's meals. */
export const DELETE = authed<{ mealId: string }>(async (_req, { db, user, params }) => json({ meals: await deleteMeal(db, params.mealId, user.id) }));
