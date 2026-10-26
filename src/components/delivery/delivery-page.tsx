import { orderflySession } from '@/lib/access/orderfly-session';
import { nativeCatalog } from '@/lib/access/native-catalog';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { DeliveryAdmin } from './delivery-admin';

// Server authorization is deliberately explicit even before shared navigation
// knows these routes. Every settings API request independently checks scope.
export async function DeliveryPage() {
  try {
    const session=await orderflySession();
    if(!session.superuser&&!session.permissions.includes('orderfly.catalog:view'))return <AccessDeniedPage/>;
    const catalog=await nativeCatalog('orderfly.catalog:view');
    return <DeliveryAdmin key={session.actorId} brands={catalog.brands.map(({id,name})=>({id,name}))} locations={catalog.locations.map(({id,name,brandId})=>({id,name,brandId}))}/>;
  } catch(error) {
    if([401,403].includes((error as {status?:number})?.status||0))return <AccessDeniedPage/>;
    return <div role="alert"><h1 className="text-2xl font-bold">Levering</h1><p>Leveringsindstillingerne kunne ikke indlæses. Genindlæs siden for at prøve igen.</p></div>;
  }
}
