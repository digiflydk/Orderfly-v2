'use client'

import { useSAFilters } from '@/hooks/use-sa-filters'
import type { SACommonFilters } from '@/types/superadmin'
import { FiltersBar } from '@/components/superadmin/FiltersBar'

type Props = {
  brands: { id: string; name: string }[]
  locations: { id: string; name: string; brandId: string }[]
  initial: SACommonFilters
}

export default function FiltersBarClient({ brands, locations, initial }: Props) {
  const { filters, setFilters } = useSAFilters(initial)

  return (
    <FiltersBar
      filters={filters}
      brands={brands}
      locations={locations}
      onChange={(next) => setFilters(next)}
    />
  )
}
