/** The web can't hand text to the Tesla app; the UI shows copy-address and directions instead. */
export async function sendToTesla(_text: string): Promise<"sent" | "fallback"> {
  return "fallback";
}
export const canSendToTesla = false;
export const devicePlatform: "android" | "ios" | null = null;
