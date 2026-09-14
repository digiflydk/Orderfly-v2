'use server'

import { nativeCatalog } from '@/lib/access/native-catalog'
import type { Brand, Location } from '@/types'
import type { SACommonFilters } from '@/types/superadmin'

export async function getFiltersData(): Promise<{
  brands: { id: string; name: string }[]
  locations: { id: string; name: string; brandId: string }[]
  initial: SACommonFilters
}> {
  const {brands, locations} = await nativeCatalog('orderfly.analytics:view');

  const today = new Date().toISOString().slice(0, 10)
  const initial: SACommonFilters = {
    dateFrom: today,
    dateTo: today,
    brandId: 'all',
    locationIds: undefined,
  }

  return { brands, locations, initial }
}
