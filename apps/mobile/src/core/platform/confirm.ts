import { Alert } from "react-native";

/** Native yes/no dialog. */
export function confirm(message: string, ok: string, cancel: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert("", message, [
      { text: cancel, style: "cancel", onPress: () => resolve(false) },
      { text: ok, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}
