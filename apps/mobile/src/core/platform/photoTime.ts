/** "2026:10:10 19:30:12" (+ "-07:00") from EXIF → Date. Without an offset it's the phone's local time. */
export function exifTime(exif: Record<string, unknown> | null | undefined): Date | null {
  const raw = (exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime) as string | undefined;
  const m = typeof raw === "string" ? /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw) : null;
  if (!m) return null;
  const offset = (exif?.OffsetTimeOriginal ?? exif?.OffsetTime) as string | undefined;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${typeof offset === "string" && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : ""}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
