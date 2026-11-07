import type { ComponentProps } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

/**
 * A screen's scroll view that keeps the focused text field above the keyboard
 * (Android's edge-to-edge layout no longer resizes the screen for it).
 */
export function FormScroll(props: ComponentProps<typeof KeyboardAwareScrollView>) {
  return <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" {...props} />;
}
