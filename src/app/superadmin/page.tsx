import { getFiltersData } from './_filters-data'
import { orderflySession } from '@/lib/access/orderfly-session'
import { canNavigate } from '@/lib/access/navigation'
import { AdminOverview } from './overview-client'

export const dynamic = 'force-dynamic'

export default async function SuperadminPage() {
  const [{ brands, locations }, access] = await Promise.all([
    getFiltersData(),
    orderflySession(),
  ])

  const destinations = [
    { href: '/superadmin/dashboard', label: 'Salgsoverblik', description: 'Følg ordrer, omsætning og udvikling.' },
    { href: '/superadmin/sales/orders', label: 'Ordrer', description: 'Find og håndtér de seneste ordrer.' },
    { href: '/superadmin/products', label: 'Produkter', description: 'Vedligehold sortimentet på tværs af brands.' },
    { href: '/superadmin/locations', label: 'Lokationer', description: 'Se og administrér dine lokationer.' },
  ].filter(destination => canNavigate(destination.href, access))

  return <AdminOverview brands={brands} locations={locations} destinations={destinations} />
}
