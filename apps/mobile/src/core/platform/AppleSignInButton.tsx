/** Sign in with Apple is iPhone-only for now (the web and Android need an Apple "Services ID" set up first). */
export function AppleSignInButton(_: { onToken: (idToken: string, name: string | null) => Promise<void>; onError: (e: unknown) => void }) {
  return null;
}
