'use server'

import { db } from '@/lib/firebase'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import type { Brand, Location } from '@/types'
import type { SACommonFilters } from '@/types/superadmin'

export async function getFiltersData(): Promise<{
  brands: { id: string; name: string }[]
  locations: { id: string; name: string; brandId: string }[]
  initial: SACommonFilters
}> {
  // Hent brands
  const brandsSnap = await getDocs(query(collection(db, 'brands'), orderBy('name', 'asc')))
  const brands: { id: string; name: string }[] = brandsSnap.docs.map(d => {
    const data = d.data() as Partial<Brand>
    return { id: d.id, name: data.name ?? 'Unnamed' }
  })

  // Hent locations
  const locSnap = await getDocs(collection(db, 'locations'))
  const locations: { id: string; name: string; brandId: string }[] = locSnap.docs.map(d => {
    const data = d.data() as Partial<Location>
    return { id: d.id, name: data.name ?? 'Unnamed', brandId: data.brandId ?? '' }
  })

  const today = new Date().toISOString().slice(0, 10)
  const initial: SACommonFilters = {
    dateFrom: today,
    dateTo: today,
    brandId: 'all',
    locationIds: undefined,
  }

  return { brands, locations, initial }
}
