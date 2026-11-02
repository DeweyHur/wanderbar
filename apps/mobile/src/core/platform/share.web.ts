/** Web: the browser share sheet where available (mobile), otherwise copy to the clipboard. */
export async function shareText(message: string): Promise<"shared" | "copied"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text: message });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "shared";
    }
  }
  await navigator.clipboard.writeText(message);
  return "copied";
}
