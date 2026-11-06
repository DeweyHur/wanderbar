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
};

export const photoApi = {
  list: (itemId: string) => api<{ photos: Photo[] }>(`/api/items/${itemId}/photos`).then((r) => r.photos),
  upload: (itemId: string, p: PickedPhoto) => {
    const form = new FormData();
    if (Platform.OS === "web") form.append("file", p.part as Blob, "photo.jpg");
    // React Native's FormData takes { uri, name, type } for files.
    else form.append("file", p.part as unknown as Blob);
    if (p.takenAt) form.append("takenAt", p.takenAt.toISOString());
    form.append("width", String(p.width));
    form.append("height", String(p.height));
    return apiUpload<Photo>(`/api/items/${itemId}/photos`, form);
  },
  remove: (id: string) => api(`/api/photos/${id}`, { method: "DELETE" }),
};
