import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflyReadGrants, orderflySession } from '@/lib/access/orderfly-session';
import { getCustomers } from '@/app/superadmin/customers/actions';
import type { Customer } from '@/types';
import { buildDirectory, type DirectoryEntry, type DirectorySource } from './directory';

export async function customerDirectory(customerRecords?: Customer[]): Promise<{ entries: DirectoryEntry[]; global: boolean }> {
  const [session, grants, customers] = await Promise.all([
    orderflySession(), orderflyReadGrants('orderfly.customers:view'), customerRecords ?? getCustomers(),
  ]);
  const brandIds = [...new Set(grants.filter(grant => grant.locationIds === null).map(grant => grant.brandId))];
  const [plays, conversions] = await Promise.all([
    Promise.all(brandIds.map(brandId => getAdminDb().collection('gamePlays').where('brandId','==',brandId).get())),
    Promise.all(brandIds.map(brandId => getAdminDb().collection('gameConversions').where('brandId','==',brandId).get())),
  ]);
  const externalSales = new Map<string,{orders:number;spend:number}>();
  conversions.forEach((snapshot,index) => snapshot.docs.forEach(doc => {
    const data=doc.data(),amount=Number(data.amount);
    if(data.brandId!==brandIds[index]||data.channel!=='external'||data.status!=='paid'||typeof data.playId!=='string'||!Number.isFinite(amount)||amount<0)return;
    const key=`${brandIds[index]}:${data.playId}`,current=externalSales.get(key)||{orders:0,spend:0};
    externalSales.set(key,{orders:current.orders+1,spend:current.spend+amount});
  }));
  const sources: DirectorySource[] = customers.map(customer => ({
    id:customer.id,brandId:customer.brandId,name:customer.fullName,email:customer.email,
    phone:customer.phone,kind:'customer',createdAt:customer.createdAt,totalOrders:customer.totalOrders,
    totalSpend:customer.totalSpend,lastOrderDate:customer.lastOrderDate,
  }));
  plays.forEach((snapshot, index) => snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.brandId !== brandIds[index] || data.mode !== 'live') return;
    const sales=externalSales.get(`${brandIds[index]}:${doc.id}`);
    sources.push({id:doc.id,brandId:brandIds[index],name:String(data.name||''),email:String(data.email||''),phone:String(data.phone||''),kind:'game',createdAt:data.createdAt,newsletter:data.newsletter===true,campaignId:String(data.campaignId||''),externalOrders:sales?.orders||0,externalSpend:sales?.spend||0});
  }));
  return {entries:buildDirectory(sources, session.superuser),global:session.superuser};
}
