export default function ConfirmationLoading() {
  return (
    <main className="min-h-screen bg-background px-4 py-12" aria-busy="true" aria-label="Din bestilling">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Din bestilling</h1>
          <span role="status" className="sr-only">Henter ordreoplysninger</span>
          <div aria-hidden="true" className="mx-auto h-5 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {['Kundeoplysninger', 'Ordreoplysninger'].map(title => <section key={title} className="space-y-5 rounded-lg border p-6">
            <h2 className="font-semibold">{title}</h2>
            <div aria-hidden="true" className="space-y-4">
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-5 w-full animate-pulse rounded bg-muted" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          </section>)}
        </div>
        <section className="space-y-5 rounded-lg border p-6">
          <h2 className="font-semibold">Din ordreoversigt</h2>
          <div aria-hidden="true" className="space-y-4">
            <div className="h-12 animate-pulse rounded bg-muted" />
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </section>
      </div>
    </main>
  );
}
