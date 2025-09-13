'use client'

import FiltersBar from '@/components/superadmin/FiltersBar'
import { useSAFilters } from '@/hooks/use-sa-filters'

export default function FiltersBarClient() {
  const { filters, setFilters } = useSAFilters()

  return (
    <FiltersBar
      onChange={(payload) => {
        // map simpelt fra FiltersBar til SACommonFilters felter som URL'en bruger
        setFilters({
          // her binder vi bare søgetekst til brandId som demo — tilpas efter dit domæne
          brandId: payload.query?.trim() ? payload.query.trim() : 'all',
          // kunne også mappes til locationIds osv. hvis du har en rigtig multi-select
        })
      }}
    />
  )
}
