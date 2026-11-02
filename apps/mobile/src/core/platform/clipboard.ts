import { Share } from "react-native";

/** Native: no clipboard module bundled yet, so share the text (the share sheet has "Copy"). */
export async function copyText(text: string) {
  await Share.share({ message: text });
}
