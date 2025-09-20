export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Forsiden renderes fra brand/location-sider eller CMS-sektioner.
          Denne root kan være tom eller vise en simpel landing. */}
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-semibold">Orderfly</h1>
        <p className="text-muted-foreground">Hjemmesiden kører.</p>
      </div>
    </main>
  );
}
