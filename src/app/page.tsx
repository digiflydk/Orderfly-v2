
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

// VIGTIGT: Vi wrapper IKKE i LegacyPublicLayout her,
// fordi LegacyPublicPage i jeres setup allerede inkluderer header/footer.
// Derved undgår vi dobbelt header/footer.
import LegacyPublicPage from "@/legacy/public/page";
import { getGeneralSettings } from "@/services/settings";

export default async function Home() {
  try {
    const settings = await getGeneralSettings();
    return <LegacyPublicPage />;
  } catch (e: any) {
    console.error("[OF-524] Home render failed:", e?.message || e, e?.stack || "");
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Der opstod en fejl</h1>
        <p className="text-muted-foreground mt-2">
          Siden kunne ikke rendere. Tjek server logs for [OF-524] for detaljer.
        </p>
      </main>
    );
  }
}
