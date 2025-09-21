
"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    // Client-side log (kommer med i browser console)
    console.error("[OF-521] GlobalError:", error?.message, error?.stack);
    // Her kan vi evt. kalde en log-endpoint, hvis det ønskes senere
  }, [error]);

  return (
    <html>
      <body>
        <main className="mx-auto max-w-3xl p-6">
          <h1 className="text-2xl font-semibold">Der gik noget galt</h1>
          <p className="text-muted-foreground mt-2">
            Prøv igen. Hvis problemet fortsætter, kontakt support.
          </p>
          <button
            className="mt-4 rounded border px-3 py-1"
            onClick={() => reset()}
          >
            Prøv igen
          </button>
        </main>
      </body>
    </html>
  );
}
