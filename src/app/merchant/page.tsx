import { getFiltersData } from '@/app/superadmin/_filters-data';
import { AdminOverview } from '@/app/superadmin/overview-client';
import { orderflySession } from '@/lib/access/orderfly-session';
import { canNavigate } from '@/lib/access/navigation';

export const dynamic='force-dynamic';

export default async function MerchantOverview() {
  const [scope,access]=await Promise.all([getFiltersData(),orderflySession()]);
  const destinations=[
    {href:'/merchant/redeem',label:'Indløs kode',description:'Find en gæsts gevinst og registrér indløsning i restauranten.'},
    {href:'/merchant/orders',label:'Ordrer',description:'Klargør dine ordrer og registrér betaling ved afhentning.'},
    {href:'/merchant/payments',label:'Betalingsmetoder',description:'Vælg onlinebetaling og betaling ved afhentning pr. restaurant.'},
    {href:'/superadmin/products',label:'Produkter',description:'Vedligehold dit sortiment.'},
    {href:'/superadmin/discounts',label:'Rabatter',description:'Administrér rabatkoder for dit brand.'},
    {href:'/superadmin/games',label:'Spil',description:'Se dine kampagner og deltagere.'},
    {href:'/superadmin/locations',label:'Lokationer',description:'Administrér dine restauranter.'},
  ].filter(item=>canNavigate(item.href,access));
  return <AdminOverview brands={scope.brands} locations={scope.locations} destinations={destinations}/>;
}
