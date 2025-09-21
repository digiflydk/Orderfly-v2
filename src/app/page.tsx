
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

import LegacyPublicLayout from "@/legacy/public/layout";
import LegacyPublicPage from "@/legacy/public/page";

export default async function Home() {
  try {
    return (
      <LegacyPublicLayout>
        <LegacyPublicPage />
      </LegacyPublicLayout>
    );
  } catch (e: any) {
    console.error("[OF-521] Home render failed:", e?.message || e, e?.stack || "");
    // Render en mild fallback (200) så vi kan se noget og læse logs
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Der opstod en fejl</h1>
        <p className="text-muted-foreground mt-2">
          Siden kunne ikke rendere. Tjek server logs for [OF-521] for detaljer.
        </p>
      </main>
    );
  }
}
