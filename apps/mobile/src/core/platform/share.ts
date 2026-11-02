import { Share } from "react-native";

/** Native share sheet. */
export async function shareText(message: string): Promise<"shared" | "copied"> {
  await Share.share({ message });
  return "shared";
}
