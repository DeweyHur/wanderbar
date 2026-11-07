import { Platform } from "react-native";
import { api, apiUpload } from "@/core/api";
import type { PickedPhoto } from "@/core/platform/photos";

export type Photo = {
  id: string;
  itemId: string;
  /** The menu's name when listed under its restaurant. */
  itemName: string | null;
  uploadedBy: string;
  name: string;
  takenAt: string | null;
  createdAt: string;
  width: number | null;
  height: number | null;
  url: string;
  thumbUrl: string;
};

export const photoApi = {
  list: (itemId: string) =>
    api<{ photos: Photo[] }>(`/api/items/${itemId}/photos`).then(
      (r) => r.photos,
    ),
  upload: (itemId: string, p: PickedPhoto) => {
    if (Platform.OS !== "web") return uploadJson(itemId, p);
    const form = new FormData();
    const ext = (b: unknown) =>
      (b as Blob).type === "image/webp" ? "webp" : "jpg";
    form.append("file", p.part as Blob, `photo.${ext(p.part)}`);
    if (p.thumb) form.append("thumb", p.thumb as Blob, `thumb.${ext(p.thumb)}`);
    if (p.takenAt) form.append("takenAt", p.takenAt.toISOString());
    form.append("width", String(p.width));
    form.append("height", String(p.height));
    return apiUpload<Photo>(`/api/items/${itemId}/photos`, form);
  },
  remove: (id: string) => api(`/api/photos/${id}`, { method: "DELETE" }),
};

type FilePart = { uri: string; type: string };

/** Phones: React Native's multipart upload failed on Android, so the files go as base64 in JSON (~200KB each). */
async function uploadJson(itemId: string, p: PickedPhoto) {
  const { File } = await import("expo-file-system");
  const part = async (f: FilePart) => ({
    data: await new File(f.uri).base64(),
    type: f.type,
  });
  return api<Photo>(`/api/items/${itemId}/photos`, {
    body: {
      file: await part(p.part as FilePart),
      thumb: p.thumb ? await part(p.thumb as FilePart) : null,
      takenAt: p.takenAt?.toISOString() ?? null,
      width: p.width,
      height: p.height,
    },
  });
}
