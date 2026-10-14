import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflyReadGrants, orderflySession } from '@/lib/access/orderfly-session';
import { getCustomers } from '@/app/superadmin/customers/actions';
import type { Customer } from '@/types';
import { buildDirectory, type DirectoryEntry, type DirectorySource } from './directory';

function stringValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))].slice(0, 50);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function customerDirectory(customerRecords?: Customer[]): Promise<{ entries: DirectoryEntry[]; global: boolean }> {
  const [session, grants, customers] = await Promise.all([
    orderflySession(), orderflyReadGrants('orderfly.customers:view'), customerRecords ?? getCustomers(),
  ]);
  const brandIds = [...new Set(grants.filter(grant => grant.locationIds === null).map(grant => grant.brandId))];
  const [plays, conversions] = await Promise.all([
    Promise.all(brandIds.map(brandId => getAdminDb().collection('gamePlays').where('brandId','==',brandId).get())),
    Promise.all(brandIds.map(brandId => getAdminDb().collection('gameConversions').where('brandId','==',brandId).get())),
  ]);
  const campaignRefs = new Map<string,{brandId:string;campaignId:string}>();
  plays.forEach((snapshot,index) => snapshot.docs.forEach(doc => {
    const data=doc.data();
    if(data.brandId!==brandIds[index]||data.mode!=='live')return;
    const campaignId=typeof data.campaignId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(data.campaignId)?data.campaignId:brandIds[index];
    campaignRefs.set(`${brandIds[index]}:${campaignId}`,{brandId:brandIds[index],campaignId});
  }));
  const campaignDocs=await Promise.all([...campaignRefs.values()].map(ref=>getAdminDb().collection('gameScratchDrafts').doc(ref.campaignId).get()));
  const campaignNames=new Map([...campaignRefs.values()].map((ref,index)=>[`${ref.brandId}:${ref.campaignId}`,campaignDocs[index].data()?.brandId===ref.brandId?String(campaignDocs[index].data()?.campaignName||'Skrabelod'):'Skrabelod']));
  const externalSales = new Map<string,{orders:number;spend:number}>();
  conversions.forEach((snapshot,index) => snapshot.docs.forEach(doc => {
    const data=doc.data(),amount=Number(data.amount);
    if(data.brandId!==brandIds[index]||data.channel!=='external'||data.status!=='paid'||typeof data.playId!=='string'||!Number.isFinite(amount)||amount<0)return;
    const key=`${brandIds[index]}:${data.playId}`,current=externalSales.get(key)||{orders:0,spend:0};
    externalSales.set(key,{orders:current.orders+1,spend:current.spend+amount});
  }));
  const sources: DirectorySource[] = customers.map(customer => {
    const extended = customer as Customer & {
      emailAliases?: unknown;
      phoneAliases?: unknown;
      integrationSources?: unknown;
    };
    const integrations = record(extended.integrationSources);
    return {
      id:customer.id,brandId:customer.brandId,name:customer.fullName,email:customer.email,
      emailAliases:stringValues(extended.emailAliases),
      phone:customer.phone,phoneAliases:stringValues(extended.phoneAliases),kind:'customer',createdAt:customer.createdAt,totalOrders:customer.totalOrders,
      totalSpend:customer.totalSpend,lastOrderDate:customer.lastOrderDate,loyaltyClassification:customer.loyaltyClassification,
      hasBookingSource:Object.keys(record(integrations.esmeralda)).length > 0,
      hasOmnisendSource:Object.keys(record(integrations.omnisend)).length > 0,
    };
  });
  plays.forEach((snapshot, index) => snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.brandId !== brandIds[index] || data.mode !== 'live') return;
    const sales=externalSales.get(`${brandIds[index]}:${doc.id}`);
    const campaignId=typeof data.campaignId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(data.campaignId)?data.campaignId:brandIds[index];
    sources.push({id:doc.id,brandId:brandIds[index],name:String(data.name||''),email:String(data.email||''),phone:String(data.phone||''),kind:'game',createdAt:data.createdAt,newsletter:data.newsletter===true,campaignId,campaignName:campaignNames.get(`${brandIds[index]}:${campaignId}`)||'Skrabelod',externalOrders:sales?.orders||0,externalSpend:sales?.spend||0});
  }));
  return {entries:buildDirectory(sources, session.superuser),global:session.superuser};
}
