import { authed } from "@/lib/http";
import { restaurantPhotoUrl } from "@/lib/restaurants";

/** The cover photo: redirects to a short-lived Google image URL (the API key never leaves the server). */
export const GET = authed<{ restaurantId: string }>(async (req, { db, user, params }) => {
  const url = await restaurantPhotoUrl(db, params.restaurantId, user.id);
  return new Response(null, { status: 302, headers: { location: new URL(url, req.url).toString(), "cache-control": "private, max-age=3000" } });
});
