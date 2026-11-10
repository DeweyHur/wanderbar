import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

/** iPhone: Apple's own "Sign in with Apple" button (Apple requires its look). */
export function AppleSignInButton({ onToken, onError }: { onToken: (idToken: string, name: string | null) => Promise<void>; onError: (e: unknown) => void }) {
  const { i18n } = useTranslation();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAvailable, () => {});
  }, []);
  if (!available) return null;
  return (
    <View testID="apple-sign-in" style={{ height: 54 }}>
      <AppleAuthentication.AppleAuthenticationButton
        // Re-mount on language change so the system label follows it.
        key={i18n.language}
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={27}
        style={{ flex: 1 }}
        onPress={async () => {
          try {
            const c = await AppleAuthentication.signInAsync({
              requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
            });
            if (!c.identityToken) return;
            // Apple gives the name only on the very first sign-in.
            const name = [c.fullName?.givenName, c.fullName?.familyName].filter(Boolean).join(" ") || null;
            await onToken(c.identityToken, name);
          } catch (e) {
            if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return;
            onError(e);
          }
        }}
      />
    </View>
  );
}
