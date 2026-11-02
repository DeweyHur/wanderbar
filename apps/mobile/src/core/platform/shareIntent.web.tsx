import type { ReactNode } from "react";

export type IncomingShare = { text: string; title: string | null } | null;

/** Web: no share target; the share screen takes a pasted link instead. */
export function IncomingShareProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useIncomingShare(): { share: IncomingShare; clear: () => void } {
  return { share: null, clear: () => {} };
}
