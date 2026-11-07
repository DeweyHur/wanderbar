import type { ComponentProps } from "react";
import { ScrollView } from "react-native";

/** On the web the browser keeps the focused field in view. */
export function FormScroll(props: ComponentProps<typeof ScrollView>) {
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} />;
}
