import exifr from "exifr";

type Part = Blob | { uri: string; name: string; type: string };
export type PickedPhoto = { part: Part; thumb: Part | null; width: number; height: number; takenAt: Date | null };

export const FULL = 1280;
export const THUMB = 360;

/** Redraw at most max px on the long side; WebP where the browser can encode it (Safari can't), else JPEG. */
async function encode(bitmap: ImageBitmap, max: number, quality: number) {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const as = (type: string, q: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
  const webp = await as("image/webp", quality);
  const blob = webp?.type === "image/webp" ? webp : await as("image/jpeg", quality + 0.08);
  if (!blob) throw new Error("encode");
  return { blob, w, h };
}

export { exifTime } from "./photoTime";

/** Choose files, read the camera time with exifr, then redraw (drops EXIF/GPS) as a 1280px photo and a 360px thumbnail. */
export async function pickPhotos(): Promise<PickedPhoto[]> {
  const files = await new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.onchange = () => done(Array.from(input.files ?? []).slice(0, 10));
    input.oncancel = () => done([]);
    document.body.appendChild(input);
    input.click();
  });
  const out: PickedPhoto[] = [];
  for (const file of files) {
    let takenAt: Date | null = null;
    try {
      const tags = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
      const d = tags?.DateTimeOriginal ?? tags?.CreateDate;
      takenAt = d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      takenAt = null;
    }
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const full = await encode(bitmap, FULL, 0.72);
    const small = await encode(bitmap, THUMB, 0.6);
    bitmap.close();
    out.push({ part: full.blob, thumb: small.blob, width: full.w, height: full.h, takenAt });
  }
  return out;
}
