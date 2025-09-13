import { getFiltersData } from './_filters-data'
import FiltersBarClient from '@/components/superadmin/FiltersBarClient'
import FiltersDebugPanel from '@/components/superadmin/FiltersDebugPanel'

export default async function SuperadminHome() {
  const { brands, locations, initial } = await getFiltersData()

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Superadmin</h1>
        <p className="text-sm text-muted-foreground">
          Brug filterbaren nedenfor for at filtrere data. Valg synces til URL’en.
        </p>
      </div>

      <FiltersBarClient brands={brands} locations={locations} initial={initial} />

      <section className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground mb-3">
          Her kan du vise din liste/indhold der reagerer på URL-filtrene.
        </p>

        {/* Midlertidigt debugpanel – fjern når du ikke længere har brug for det */}
        <FiltersDebugPanel />
      </section>
    </div>
  )
}
