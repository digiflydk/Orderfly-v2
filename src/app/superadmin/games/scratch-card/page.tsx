import { gameBrands, getScratchCardDraft } from '../actions';
import { ScratchCardEditor } from '@/components/games/ScratchCardEditor';
import { getAdminDb } from '@/lib/firebase-admin';
import { esmeraldaScratchTest } from '@/lib/games/scratch-card';
import { AggregateField } from 'firebase-admin/firestore';
export const dynamic = 'force-dynamic';
export default async function ScratchCardPage({searchParams}:{searchParams:Promise<{brand?:string}>}) {
  const brands = await gameBrands();
  const requested = (await searchParams).brand;
  const brandId = brands.some(b=>b.id===requested) ? requested! : brands[0]?.id;
  const saved = brandId ? await getScratchCardDraft(brandId) : null;
  const draft = saved || (brandId && brands.find(b=>b.id===brandId)?.slug==='esmeralda' ? esmeraldaScratchTest(brandId) : null);
  const status=brandId?(await getAdminDb().collection('gameScratchDrafts').doc(brandId).get()).data()?.status||'draft':'draft';
  let metrics:{impressions:number;opens:number;starts:number;completes:number;prizes:number;mailsAccepted:number;orders:number;revenue:number}|null=null;
  if(brandId){
    const db=getAdminDb(),events=db.collection('gameEvents'),conversions=db.collection('gameConversions');
    try{
      const [counts,paid,mails]=await Promise.all([
        Promise.all((['game_impression','game_open','game_start','game_complete','prize_issued'] as const).map(event=>events.where('brandId','==',brandId).where('event','==',event).count().get())),
        conversions.where('brandId','==',brandId).where('status','==','paid').aggregate({orders:AggregateField.count(),revenue:AggregateField.sum('amount')}).get(),
        db.collection('gameMailOutbox').where('brandId','==',brandId).where('state','==','accepted').count().get(),
      ]);
      metrics={impressions:counts[0].data().count,opens:counts[1].data().count,starts:counts[2].data().count,completes:counts[3].data().count,prizes:counts[4].data().count,mailsAccepted:mails.data().count,orders:Number(paid.data().orders||0),revenue:Number(paid.data().revenue||0)};
    }catch{metrics=null;}
  }
  return <main className="space-y-4 p-6">
    <h1 className="text-3xl font-semibold">Skrabelod</h1>
    <p className="text-muted-foreground">Opsæt spillet trin for trin, se gæstens oplevelse og test, før du aktiverer det.</p>
    {metrics?<section className="rounded-xl border bg-white p-5" aria-label="Kampagnens resultater"><h2 className="mb-3 text-lg font-semibold">Resultater</h2><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{([['Visninger',metrics.impressions],['Åbninger',metrics.opens],['Starter',metrics.starts],['Gennemførte',metrics.completes],['Udstedte præmier',metrics.prizes],['Mail accepteret',metrics.mailsAccepted],['Betalte køb',metrics.orders],['Omsætning',`${metrics.revenue.toLocaleString('da-DK')} kr.`],['Køb pr. gennemført spil',metrics.completes?`${(100*metrics.orders/metrics.completes).toFixed(1)} %`:'0 %']] as const).map(([label,value])=><div key={label} className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-600">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>)}</div><p className="mt-3 text-xs text-gray-600">Mail accepteret betyder, at notifikationsplatformen har modtaget anmodningen, ikke at kunden har modtaget mailen. Betalte køb kommer fra Orderfly eller en signeret ekstern ordrebekræftelse. Restaurantregistrering tilføjes senere.</p></section>:brandId?<p className="rounded-lg bg-amber-50 p-3 text-sm">Målinger er ikke tilgængelige endnu. Kontrollér Firestore-indekserne.</p>:null}
    {brandId ? <ScratchCardEditor key={brandId} brands={brands} brandId={brandId} draft={draft} status={status} preset={!saved && !!draft}/> : <p>Du har ikke adgang til et brand med website-rettigheder.</p>}
  </main>;
}
