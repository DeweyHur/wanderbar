import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/** A photo ready to upload: resized to 1600px on the long side, re-encoded as JPEG (no EXIF/GPS left). */
export type PickedPhoto = { part: Blob | { uri: string; name: string; type: string }; width: number; height: number; takenAt: Date | null };

const MAX = 1600;

export { exifTime } from "./photoTime";
import { exifTime } from "./photoTime";

/** Pick up to 10 photos from the library. Empty when cancelled. */
export async function pickPhotos(): Promise<PickedPhoto[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, exif: true, quality: 1 });
  if (res.canceled) return [];
  const out: PickedPhoto[] = [];
  for (const a of res.assets) {
    const ref = await ImageManipulator.manipulate(a.uri, { maxWidth: MAX, maxHeight: MAX }).renderAsync();
    const saved = await ref.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    out.push({ part: { uri: saved.uri, name: "photo.jpg", type: "image/jpeg" }, width: saved.width, height: saved.height, takenAt: exifTime(a.exif) });
  }
  return out;
}
