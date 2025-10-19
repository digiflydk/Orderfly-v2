// src/app/[brandSlug]/[locationSlug]/error.tsx
"use client";

import { useEffect } from "react";
import EmptyState from "@/components/ui/empty-state";

export default function BrandLocationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Kan evt. sende til client-side log – men keep it simple.
    // Server-log sker i page.tsx try/catch (på serversiden).
  }, [error]);

  return (
    <EmptyState
      title="Noget gik galt på brand-siden"
      hint="Prøv at genindlæse eller gå tilbage."
      details={process.env.NEXT_PUBLIC_ENABLE_ENV_DEBUG ? `${error.message}\n\n${error.stack ?? ""}` : undefined}
      actions={
        <>
          <button onClick={() => reset()} className="px-4 py-2 rounded bg-black text-white">
            Prøv igen
          </button>
          <a href="/" className="px-4 py-2 rounded border">Til forsiden</a>
        </>
      }
    />
  );
}
