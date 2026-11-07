import { useEffect, useRef, type ComponentProps } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, type ScrollViewInstance } from "react-native";

/**
 * A screen's scroll view that keeps the focused text field above the keyboard (Android's edge-to-edge
 * layout no longer resizes the screen for it). Built-ins only: an earlier version used
 * react-native-keyboard-controller, whose Reanimated dependency wasn't linked and crashed the app.
 */
export function FormScroll({ style, ...props }: ComponentProps<typeof ScrollView>) {
  const scroll = useRef<ScrollViewInstance | null>(null);
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      const input = TextInput.State.currentlyFocusedInput();
      const inner = scroll.current?.getInnerViewRef();
      if (!input || !inner) return;
      // Bring the field into view with a little room under it.
      input.measureLayout(
        inner as never,
        (_x, y, _w, h) => scroll.current?.scrollTo({ y: Math.max(0, y + h - 160), animated: true }),
        () => {},
      );
    });
    return () => sub.remove();
  }, []);
  return (
    <KeyboardAvoidingView style={[{ flex: 1 }, style as object]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        {...props}
      />
    </KeyboardAvoidingView>
  );
}
