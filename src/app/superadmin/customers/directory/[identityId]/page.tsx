import { notFound } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { customerDirectory } from '@/lib/customers/directory-server';
import { getAdminDb } from '@/lib/firebase-admin';
import { asDate } from '@/lib/loyalty/model';

export const dynamic = 'force-dynamic';

export default async function DirectoryDetail({params}:{params:Promise<{identityId:string}>}) {
  const {identityId}=await params;
  if (!/^[a-f0-9]{64}$/.test(identityId)) notFound();
  // Resolve from authorized tenant records on every request. A guessed hash
  // never gives access to another merchant's customer or order data.
  const {entries}=await customerDirectory();
  const entry=entries.find(row=>row.id===identityId);
  if (!entry) notFound();
  const db=getAdminDb();
  const [brands,orderSnapshots]=await Promise.all([
    Promise.all(entry.brandIds.map(id=>db.collection('brands').doc(id).get())),
    Promise.all(entry.sources.filter(source=>source.kind==='customer').map(source=>db.collection('orders').where('brandId','==',source.brandId).where('customerDetails.id','==',source.id).get())),
  ]);
  const names=new Map(brands.map(brand=>[brand.id,String(brand.data()?.name||brand.id)]));
  const orders=orderSnapshots.flatMap(snapshot=>snapshot.docs.map(doc=>({id:doc.id,brandId:String(doc.data().brandId),status:String(doc.data().status||''),amount:Number(doc.data().totalAmount||0),date:asDate(doc.data().createdAt)?.toISOString()||''}))).sort((a,b)=>b.date.localeCompare(a.date));
  return <main className="space-y-6 p-4 sm:p-6">
    <Link href="/superadmin/customers" className="text-sm underline">Tilbage til kunder</Link>
    <div><h1 className="text-2xl font-semibold">{entry.name}</h1><p className="break-all text-muted-foreground">{entry.email}</p><p className="text-sm text-muted-foreground">Match på e-mail. Kontroller identiteten før personlige oplysninger bruges på tværs af merchants.</p></div>
    <div className="grid gap-3 sm:grid-cols-3">{[['Merchants',entry.brandIds.length],['Betalte køb',entry.totalOrders],['Samlet omsætning',entry.totalSpend.toLocaleString('da-DK',{style:'currency',currency:'DKK'})]] .map(([label,value])=><div key={label} className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}</div>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Aktivitet pr. merchant</h2><div className="grid gap-3 md:grid-cols-2">{entry.brandIds.map(brandId=>{const sources=entry.sources.filter(source=>source.brandId===brandId),games=sources.filter(source=>source.kind==='game');return <div key={brandId} className="rounded-lg border p-4"><h3 className="font-semibold">{names.get(brandId)}</h3><p className="text-sm">{games.length} spildeltagelser</p>{sources.filter(source=>source.kind==='customer').map(source=><p key={source.id} className="mt-2 text-sm"><Link href={`/superadmin/customers/${encodeURIComponent(source.id)}`} className="underline">Åbn kundepost og merchantdata</Link></p>)}{games.map(source=><p key={source.id} className="mt-2 text-sm text-muted-foreground">Games · {source.date?new Date(source.date).toLocaleDateString('da-DK'):'Ukendt dato'} · Nyhedsbrev: {source.newsletter?'Ja':'Nej'}{source.externalOrders?` · Eksterne køb: ${source.externalOrders} (${(source.externalSpend||0).toLocaleString('da-DK')} kr.)`:''}</p>)}</div>})}</div></section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Orderfly ordrer på tværs</h2><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-muted/40"><tr><th className="p-3">Dato</th><th className="p-3">Merchant</th><th className="p-3">Ordre</th><th className="p-3">Status</th><th className="p-3 text-right">Beløb</th></tr></thead><tbody>{orders.map(order=><tr key={order.id} className="border-t"><td className="p-3">{order.date?new Date(order.date).toLocaleDateString('da-DK'):'—'}</td><td className="p-3">{names.get(order.brandId)}</td><td className="p-3"><Link href={`/superadmin/sales/orders/${encodeURIComponent(order.id)}`} className="underline">{order.id}</Link></td><td className="p-3">{order.status}</td><td className="p-3 text-right">{order.amount.toLocaleString('da-DK',{style:'currency',currency:'DKK'})}</td></tr>)}{!orders.length&&<tr><td colSpan={5} className="p-5 text-center text-muted-foreground">Ingen Orderfly ordrer endnu.</td></tr>}</tbody></table></div><p className="text-xs text-muted-foreground">Samlet omsætning omfatter også betalte eksterne Games-køb, når køb er knyttet til et individuelt spil. Delte kampagnekoder uden identificeret deltager kan ikke henføres til en kunde.</p></section>
  </main>;
}
