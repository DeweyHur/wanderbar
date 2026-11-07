import { z } from "zod";
import { authed, json } from "@/lib/http";
import { badRequest } from "@/lib/errors";
import { addPhoto, listPhotos } from "@/lib/photos";

/** Photos of a restaurant (with its menus'), a menu or a dish. */
export const GET = authed<{ itemId: string }>(async (_req, { db, user, params }) => json({ photos: await listPhotos(db, params.itemId, user.id) }));

const int = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\d{1,5}$/.test(v) ? Number(v) : null);

// The phone apps send JSON with base64 images (React Native's multipart uploads failed on Android).
const Part = z.object({ data: z.string().max(6_000_000), type: z.string().max(40) });
const JsonBody = z.object({
  file: Part,
  thumb: Part.nullable().optional(),
  takenAt: z.string().max(40).nullable().optional(),
  width: z.number().int().min(0).max(99999).nullable().optional(),
  height: z.number().int().min(0).max(99999).nullable().optional(),
});
const bytes = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));

/**
 * multipart/form-data (web): file (already resized on the device), thumb (optional small copy), takenAt (ISO, optional), width, height.
 * application/json (phones): the same, with file/thumb as { data: base64, type }.
 */
export const POST = authed<{ itemId: string }>(async (req, { db, user, params }) => {
  if (req.headers.get("content-type")?.includes("application/json")) {
    const b = JsonBody.parse(await req.json());
    const photo = await addPhoto(db, params.itemId, user.id, {
      body: bytes(b.file.data),
      contentType: b.file.type,
      width: b.width ?? null,
      height: b.height ?? null,
      takenAt: b.takenAt ? new Date(b.takenAt) : null,
      thumb: b.thumb ? { body: bytes(b.thumb.data), contentType: b.thumb.type } : null,
    });
    return json(photo, 201);
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !file || typeof file === "string") throw badRequest("photo.file_required");
  const takenAt = form.get("takenAt");
  const thumb = form.get("thumb");
  const photo = await addPhoto(db, params.itemId, user.id, {
    body: new Uint8Array(await file.arrayBuffer()),
    contentType: file.type,
    width: int(form.get("width")),
    height: int(form.get("height")),
    takenAt: typeof takenAt === "string" && takenAt ? new Date(takenAt) : null,
    thumb: thumb && typeof thumb !== "string" ? { body: new Uint8Array(await thumb.arrayBuffer()), contentType: thumb.type } : null,
  });
  return json(photo, 201);
});
