
import type { ReactNode } from "react";

export default function M3Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-m3-dark text-m3-white">
      {children}
    </div>
  );
}
