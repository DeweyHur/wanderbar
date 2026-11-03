/** The web has no KakaoTalk hand-off; the share menu there offers copy instead. */
export async function shareToKakao(_text: string): Promise<"sent" | "fallback"> {
  return "fallback";
}
