/** Web uses Google Identity Services' own button (GoogleSignInButton.web.tsx), not a programmatic call. */
export async function googleIdToken(): Promise<string | null> {
  return null;
}

export function googleSignOut() {
  window.google?.accounts.id.disableAutoSelect();
}

type GsiButtonOptions = { theme?: string; size?: string; text?: string; shape?: string; width?: number; locale?: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }): void;
          renderButton(el: HTMLElement, opts: GsiButtonOptions): void;
          disableAutoSelect(): void;
        };
      };
    };
  }
}
