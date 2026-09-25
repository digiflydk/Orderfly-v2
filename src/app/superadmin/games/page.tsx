import Link from '@/components/superadmin/admin-link';
export default function GamesPage() {
  return <main className="space-y-5 p-6">
    <div><h1 className="text-3xl font-semibold">Games</h1><p className="text-muted-foreground">Spil til brandsider og nyhedsbreve.</p></div>
    <div className="max-w-md rounded-xl border bg-white p-6 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Første spil</div>
      <h2 className="mt-2 text-xl font-semibold">Scratch Card · Skrabelod</h2>
      <p className="mt-2 text-sm text-muted-foreground">Opret et udkast, vælg placering og prøv skrabeoplevelsen i administrator-preview.</p>
      <Link className="mt-5 inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white" href="/superadmin/games/scratch-card">Åbn skrabelod</Link>
    </div>
  </main>;
}
