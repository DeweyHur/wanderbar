import { placeDetails } from "@/lib/google";
import { authed, json } from "@/lib/http";

export const GET = authed<{ placeId: string }>(async (req, { params }) => {
  const session = new URL(req.url).searchParams.get("sessionToken");
  return json(await placeDetails(params.placeId, session));
});
