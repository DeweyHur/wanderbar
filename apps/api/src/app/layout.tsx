import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "wanderbar", robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
