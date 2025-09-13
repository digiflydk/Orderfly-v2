'use client'

import { useMemo, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { SACommonFilters } from '@/types/superadmin'
import { toQuery, fromQuery } from '@/lib/query-utils' // brug den sti du lagde utils i

export function useSAFilters(defaults?: Partial<SACommonFilters>) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const filters = useMemo<SACommonFilters>(() => {
    const parsed = fromQuery(sp)
    return {
      dateFrom: defaults?.dateFrom ?? parsed.dateFrom,
      dateTo: defaults?.dateTo ?? parsed.dateTo,
      brandId: defaults?.brandId ?? parsed.brandId,
      locationIds: defaults?.locationIds ?? parsed.locationIds,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, defaults?.dateFrom, defaults?.dateTo, defaults?.brandId, JSON.stringify(defaults?.locationIds)])

  const setFilters = useCallback((next: Partial<SACommonFilters>) => {
    const merged: SACommonFilters = {
      dateFrom: next.dateFrom ?? filters.dateFrom,
      dateTo: next.dateTo ?? filters.dateTo,
      brandId: next.brandId ?? filters.brandId,
      locationIds: next.locationIds ?? filters.locationIds,
    }
    const qs = toQuery(merged)
    router.replace(`${pathname}?${qs}`)
  }, [filters, pathname, router])

  return { filters, setFilters }
}
