'use client'

import { FiltersBar } from '@/components/superadmin/FiltersBar'

export default function SuperadminHome() {
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Superadmin</h1>
        <p className="text-sm text-muted-foreground">
          Brug filterbaren nedenfor for at filtrere data. Valg synces til URL’en.
        </p>
      </div>

      <FiltersBar />

      <section className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          Her kan du vise din liste/indhold der reagerer på URL-filtrene.
        </p>
      </section>
    </div>
  )
}
