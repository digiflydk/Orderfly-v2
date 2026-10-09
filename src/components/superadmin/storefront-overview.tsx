import Link from 'next/link';
import AdminLink from '@/components/superadmin/admin-link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { StorefrontOverview } from '@/lib/storefront-types';

const statusLabels: Record<string, string> = {active: 'Aktivt', trialing: 'Prøveperiode', pending: 'Afventer', suspended: 'Suspenderet'};
export function StorefrontOverviewView({brands}: {brands: StorefrontOverview[]}) {
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Brand Website · Takeaway</h1>
      <p className="text-muted-foreground">Én standard-webshop med brandets logo og eksisterende udseende. Menu, priser og levering styres fra produkter og lokationer.</p>
    </div>
    {!brands.length && <p>Ingen brands er tilgængelige med din adgang.</p>}
    {brands.map(brand => <Card key={brand.id}><CardContent className="pt-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-xl font-semibold">{brand.name}</h2>
          <p className="text-sm text-muted-foreground">Brandstatus: {statusLabels[brand.brandStatus] || 'Ukendt'} · Standard-webshop</p></div>
        <div className="flex flex-wrap gap-2">
          {brand.canEditBrand && <Button variant="outline" asChild><AdminLink href={`/superadmin/brands/edit/${brand.id}`}>Brandindstillinger</AdminLink></Button>}
          {brand.href && <Button asChild><Link href={brand.href} target="_blank" rel="noopener noreferrer">Åbn webshop</Link></Button>}
        </div>
      </div>
      {!brand.href && <p role="status">Brandets webadresse mangler eller er ugyldig.</p>}
      <h3 className="font-medium">Lokationer med din adgang</h3>
      {!brand.locations.length ? <p className="text-sm text-muted-foreground">Ingen lokationer tilgængelige.</p> : <ul className="divide-y">
        {brand.locations.map(location => <li key={location.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <span>{location.name} <span className="text-sm text-muted-foreground">({location.active ? 'Aktiv lokation' : 'Inaktiv lokation'})</span></span>
          {location.active && location.href ? <Link className="underline" href={location.href} target="_blank" rel="noopener noreferrer">Åbn menu</Link> : !location.href ? <span className="text-sm">Webadresse mangler</span> : null}
        </li>)}
      </ul>}
    </CardContent></Card>)}
  </div>;
}
