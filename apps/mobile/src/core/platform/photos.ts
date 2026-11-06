import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

type Part = Blob | { uri: string; name: string; type: string };

/**
 * A photo ready to upload: re-encoded as WebP (no EXIF/GPS left) at 1280px on the long side, plus a
 * ~360px copy for lists. About 150KB + 15KB per photo, a third of a 1600px JPEG.
 */
export type PickedPhoto = { part: Part; thumb: Part | null; width: number; height: number; takenAt: Date | null };

export const FULL = 1280;
export const THUMB = 360;

export { exifTime } from "./photoTime";
import { exifTime } from "./photoTime";

/** Pick up to 10 photos from the library. Empty when cancelled. */
export async function pickPhotos(): Promise<PickedPhoto[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, exif: true, quality: 1 });
  if (res.canceled) return [];
  const out: PickedPhoto[] = [];
  for (const a of res.assets) {
    const full = await (await ImageManipulator.manipulate(a.uri, { maxWidth: FULL, maxHeight: FULL }).renderAsync()).saveAsync({ compress: 0.72, format: SaveFormat.WEBP });
    const small = await (await ImageManipulator.manipulate(a.uri, { maxWidth: THUMB, maxHeight: THUMB }).renderAsync()).saveAsync({ compress: 0.6, format: SaveFormat.WEBP });
    out.push({
      part: { uri: full.uri, name: "photo.webp", type: "image/webp" },
      thumb: { uri: small.uri, name: "thumb.webp", type: "image/webp" },
      width: full.width,
      height: full.height,
      takenAt: exifTime(a.exif),
    });
  }
  return out;
}
