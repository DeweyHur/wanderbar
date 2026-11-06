import exifr from "exifr";

export type PickedPhoto = { part: Blob | { uri: string; name: string; type: string }; width: number; height: number; takenAt: Date | null };

const MAX = 1600;

export { exifTime } from "./photoTime";

/** Choose files, read the camera time with exifr, then redraw at ≤1600px as JPEG (drops EXIF/GPS). */
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
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.82));
    out.push({ part: blob, width: w, height: h, takenAt });
  }
  return out;
}
