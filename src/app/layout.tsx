export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Orderfly",
  description: "Orderfly platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="da">
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
