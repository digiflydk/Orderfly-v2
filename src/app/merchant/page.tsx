import { redirect } from 'next/navigation';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflyReadGrants, verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { MerchantGames, type MerchantVoucher } from './merchant-games';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export default async function MerchantPage({searchParams}:{searchParams:Promise<{brand?:string;location?:string}>}){
  await verifiedOrderflyIdentity().catch(()=>redirect('/admin-login?next=%2Fmerchant'));
  const view=await orderflyReadGrants('orderfly.games:view').catch(()=>[]);
  const redeem=await orderflyReadGrants('orderfly.games:redeem').catch(()=>[]);
  if(!view.length)return <main className="mx-auto max-w-lg p-6"><h1 className="text-2xl font-semibold">Restaurantens spil</h1><p className="mt-4">Din konto mangler adgang til at se spilkoder. Bed administratoren om Games-adgang.</p></main>;
  const db=getAdminDb(),query=await searchParams;
  const brands=await Promise.all(view.map(async grant=>{const doc=await db.collection('brands').doc(grant.brandId).get();return {id:grant.brandId,name:String(doc.data()?.name||grant.brandId)};}));
  const brandId=brands.find(row=>row.id===query.brand)?.id||brands[0].id;
  const grant=view.find(row=>row.brandId===brandId)!;
  const edit=redeem.find(row=>row.brandId===brandId);
  const locationDocs=await db.collection('locations').where('brandId','==',brandId).get();
  const locations=locationDocs.docs.filter(doc=>doc.data().isActive!==false&&(grant.locationIds===null||grant.locationIds.includes(doc.id)))
    .map(doc=>({id:doc.id,name:String(doc.data().name||doc.id),canRedeem:!!edit&&(edit.locationIds===null||edit.locationIds.includes(doc.id))}));
  const locationId=locations.find(row=>row.id===query.location)?.id||locations[0]?.id||'';
  const vouchers=await db.collection('gameVouchers').where('brandId','==',brandId).get();
  const eligible=vouchers.docs.filter(doc=>{const data=doc.data();return data.mode==='live'&&data.codeMode!=='shared'&&
    (Array.isArray(data.redemptionChannels)?data.redemptionChannels.includes('restaurant'):data.redemption!=='website');});
  const plays=new Map<string,FirebaseFirestore.DocumentData>();
  const ids=[...new Set(eligible.map(doc=>String(doc.data().playId||'')).filter(id=>/^[a-f0-9]{64}$/.test(id)))];
  for(let i=0;i<ids.length;i+=100){
    const batch=await db.getAll(...ids.slice(i,i+100).map(id=>db.collection('gamePlays').doc(id)));
    for(const doc of batch)if(doc.exists&&doc.data()?.brandId===brandId)plays.set(doc.id,doc.data()!);
  }
  const rows:MerchantVoucher[]=eligible.map(doc=>{
    const data=doc.data(),play=plays.get(String(data.playId||''));
    return {id:doc.id,date:data.issuedAt?.toDate?.()?.toISOString()||null,name:String(play?.name||''),email:String(play?.email||''),phone:String(play?.phone||''),
      code:String(data.code||''),prize:String(data.prizeName||''),status:data.state==='redeemed'?'Indløst':'Klar til indløsning',redeemable:data.state==='issued'};
  }).filter(row=>row.name&&row.code).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return <MerchantGames brands={brands} brandId={brandId} locations={locations} locationId={locationId} rows={rows}/>;
}
