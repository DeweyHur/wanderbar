import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import type { ReactNode } from "react";

export type IncomingShare = { text: string; title: string | null } | null;

/** Native: text/links shared into the app from other apps (Yelp, Google Maps, …). */
export function IncomingShareProvider({ children }: { children: ReactNode }) {
  return <ShareIntentProvider options={{ resetOnBackground: false }}>{children}</ShareIntentProvider>;
}

export function useIncomingShare(): { share: IncomingShare; clear: () => void } {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  if (!hasShareIntent) return { share: null, clear: () => {} };
  const text = [shareIntent.text, shareIntent.webUrl].filter(Boolean).join("\n");
  return { share: text ? { text, title: shareIntent.meta?.title ?? null } : null, clear: () => resetShareIntent() };
}
