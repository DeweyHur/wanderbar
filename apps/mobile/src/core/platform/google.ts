import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";

GoogleSignin.configure({
  // ID tokens are issued for the Web client ID; that's the audience the server checks.
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

/** Native Google sign-in. Returns null if the user cancelled. */
export async function googleIdToken(): Promise<string | null> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) return null;
  if (!res.data.idToken) throw new Error("auth.no_id_token");
  return res.data.idToken;
}

export const googleSignOut = () => GoogleSignin.signOut().catch(() => {});
