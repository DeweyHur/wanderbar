import { authed, json } from "@/lib/http";
import { badRequest } from "@/lib/errors";
import { addPhoto, listPhotos } from "@/lib/photos";

/** Photos of a restaurant (with its menus'), a menu or a dish. */
export const GET = authed<{ itemId: string }>(async (_req, { db, user, params }) => json({ photos: await listPhotos(db, params.itemId, user.id) }));

const int = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\d{1,5}$/.test(v) ? Number(v) : null);

/** multipart/form-data: file (already resized on the device), takenAt (ISO, optional), width, height. */
export const POST = authed<{ itemId: string }>(async (req, { db, user, params }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !file || typeof file === "string") throw badRequest("photo.file_required");
  const takenAt = form.get("takenAt");
  const photo = await addPhoto(db, params.itemId, user.id, {
    body: new Uint8Array(await file.arrayBuffer()),
    contentType: file.type,
    width: int(form.get("width")),
    height: int(form.get("height")),
    takenAt: typeof takenAt === "string" && takenAt ? new Date(takenAt) : null,
  });
  return json(photo, 201);
});
