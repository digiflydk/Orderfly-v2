"use client";
import * as React from "react";

type Props = { children: React.ReactNode };

// ✅ Default export + (valgfri) named export
export default function PublicLayout({ children }: Props) {
  return <>{children}</>;
}
export { PublicLayout };
