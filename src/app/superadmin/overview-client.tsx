'use client'

import { useMemo, useState } from 'react'
import Link from '@/components/superadmin/admin-link'
import { ArrowUpRight, Building2, MapPin } from 'lucide-react'
import FiltersBar from './FiltersBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Brand = { id: string; name: string }
type Location = { id: string; name: string; brandId: string }
type Destination = { href: string; label: string; description: string }

export function AdminOverview({ brands, locations, destinations }: {
  brands: Brand[]
  locations: Location[]
  destinations: Destination[]
}) {
  const [selection, setSelection] = useState<Record<string, unknown>>({})
  const selectedBrand = typeof selection.brandId === 'string' ? selection.brandId : ''
  const selectedLocation = typeof selection.locationId === 'string' ? selection.locationId : ''
  const visibleLocations = useMemo(() => locations.filter(location =>
    (!selectedBrand || location.brandId === selectedBrand) &&
    (!selectedLocation || location.id === selectedLocation)
  ), [locations, selectedBrand, selectedLocation])

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-primary">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Overblik</h1>
        <p className="mt-2 text-sm text-muted-foreground">Vælg brand og lokation, og gå direkte til din opgave.</p>
      </header>

      <FiltersBar brands={brands} locations={locations} onChange={setSelection} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Brands i udvalget</CardTitle>
            <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
          </CardHeader>
          <CardContent><p className="text-3xl font-semibold">{selectedBrand ? 1 : brands.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lokationer i udvalget</CardTitle>
            <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
          </CardHeader>
          <CardContent><p className="text-3xl font-semibold">{visibleLocations.length}</p></CardContent>
        </Card>
      </div>

      <section aria-labelledby="admin-tasks-title">
        <h2 id="admin-tasks-title" className="mb-3 text-lg font-semibold">Arbejdsområder</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {destinations.map(destination => (
            <Link key={destination.href} href={destination.href} className="admin-data-panel group flex items-start justify-between gap-4 p-5 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span><strong className="block text-base font-semibold">{destination.label}</strong><span className="mt-1 block text-sm text-muted-foreground">{destination.description}</span></span>
              <ArrowUpRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
