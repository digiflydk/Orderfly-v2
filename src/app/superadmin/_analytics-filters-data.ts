'use server'

import { nativeCatalog } from '@/lib/access/native-catalog'

// Sales filter choices must use the same grant as the sales query. Other
// administration screens can have a wider union of independently granted scopes.
export async function getAnalyticsFiltersData() {
  return nativeCatalog('orderfly.analytics:view')
}
