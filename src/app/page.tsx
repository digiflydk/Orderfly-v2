export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function RootPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Orderfly</h1>
      <p className="text-muted-foreground">Service is running.</p>
      <p><a href="/superadmin" className="underline">Go to Superadmin</a></p>
    </main>
  );
}
