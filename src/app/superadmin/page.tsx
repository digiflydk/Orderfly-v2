// src/app/superadmin/page.tsx
import React from "react"
import Link from "next/link"
import { getFiltersData } from "./_filters-data"
import FiltersBar from "./FiltersBar"
import Sidebar from "./sidebar" // eller "./sidebar-client" hvis det er den du har

export const dynamic = "force-dynamic"

export default async function SuperadminPage() {
  // Hent brands/locations serverside (genbrug eksisterende helper)
  const { brands, locations } = await getFiltersData()

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto flex max-w-[1400px]">
        {/* Sidebar (eksisterende komponent) */}
        <aside className="hidden shrink-0 border-r lg:block" style={{ width: 264 }}>
          <Sidebar />
        </aside>

        {/* Content */}
        <main className="flex w-full flex-col">
          {/* Top section: title + filters */}
          <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
            <div className="px-4 py-4 sm:px-6 lg:px-8">
              <h1 className="text-xl font-semibold tracking-tight">Superadmin</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Brug filterbaren nedenfor til at vælge brand og location.
              </p>
            </div>
            <div className="px-4 pb-4 sm:px-6 lg:px-8">
              <FiltersBar brands={brands} locations={locations} />
            </div>
          </div>

          {/* Body: små statuskort + quick links */}
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border p-4">
                <div className="text-sm font-medium">Brands</div>
                <div className="mt-1 text-2xl font-bold">{brands.length}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Importeret fra Firestore (server-side).
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-sm font-medium">Locations</div>
                <div className="mt-1 text-2xl font-bold">{locations.length}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Filtrér i toppen for at arbejde brand-specifikt.
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="text-sm font-medium">Hurtige genveje</div>
                <div className="mt-3 flex flex-col gap-2 text-sm">
                  <Link href="/superadmin/website/pages/header" className="underline">
                    Website → Pages → Header
                  </Link>
                  <Link href="/superadmin/website/pages/footer" className="underline">
                    Website → Pages → Footer
                  </Link>
                  <Link href="/superadmin/brands" className="underline">
                    Catalog → Brands
                  </Link>
                  <Link href="/superadmin/locations" className="underline">
                    Catalog → Locations
                  </Link>
                  <Link href="/superadmin/settings" className="underline">
                    Settings
                  </Link>
                </div>
              </div>
            </div>

            {/* Info-boks */}
            <div className="mt-6 rounded-xl border p-4">
              <div className="text-sm font-medium">Tip</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Denne side bruger eksisterende komponenter. Når UI’et er stabilt, laver vi
                databindings-opgaven (gem/læs af Header/Footer pr. brand/location).
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
