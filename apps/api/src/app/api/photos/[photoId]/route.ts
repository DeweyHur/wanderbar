import { authed, json } from "@/lib/http";
import { deletePhoto, photoFile } from "@/lib/photos";

/** The image, for members only (never a public URL). Photos don't change, so devices may keep them. */
export const GET = authed<{ photoId: string }>(async (req, { db, user, params }) => {
  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
  const f = await photoFile(db, params.photoId, user.id, size);
  return new Response(f.body as BodyInit, {
    headers: { "content-type": f.contentType, "cache-control": "private, max-age=604800, immutable", "x-content-type-options": "nosniff" },
  });
});

export const DELETE = authed<{ photoId: string }>(async (_req, { db, user, params }) => {
  await deletePhoto(db, params.photoId, user.id);
  return json({ ok: true });
});
