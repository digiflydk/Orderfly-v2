import { gameBrands, gameProducts, getScratchCardDraft } from '../actions';
import { ScratchCardEditor } from '@/components/games/ScratchCardEditor';
import { getAdminDb } from '@/lib/firebase-admin';
import { esmeraldaScratchTest } from '@/lib/games/scratch-card';
import Link from '@/components/superadmin/admin-link';
import { brandCampaigns } from '@/lib/games/campaign';
import { AggregateField } from 'firebase-admin/firestore';
export const dynamic = 'force-dynamic';
export default async function ScratchCardPage({searchParams}:{searchParams:Promise<{brand?:string;campaign?:string}>}) {
  const brands = await gameBrands();
  const query = await searchParams,requested=query.brand;
  const brandId = brands.some(b=>b.id===requested) ? requested! : brands[0]?.id;
  const campaigns=brandId?await brandCampaigns(getAdminDb(),brandId):[];
  const campaignId=campaigns.some(row=>row.id===query.campaign)?query.campaign!:brandId||'';
  const saved = brandId ? await getScratchCardDraft(brandId,campaignId) : null;
  const draft = saved || (brandId && brands.find(b=>b.id===brandId)?.slug==='esmeralda' ? esmeraldaScratchTest(brandId) : null);
  const status=campaigns.find(row=>row.id===campaignId)?.data().status||'draft';
  const products=brandId?await gameProducts(brandId):[];
  let metrics:{impressions:number;opens:number;starts:number;completes:number;prizes:number;mailsAccepted:number;orders:number;revenue:number}|null=null;
  if(brandId&&saved){
    const db=getAdminDb();
    try{
      if(campaignId!==brandId){
        const [counts,paid,mails]=await Promise.all([
          Promise.all((['game_impression','game_open','game_start','game_complete','prize_issued'] as const).map(event=>db.collection('gameEvents').where('campaignId','==',campaignId).where('event','==',event).count().get())),
          db.collection('gameConversions').where('campaignId','==',campaignId).where('status','==','paid').aggregate({orders:AggregateField.count(),revenue:AggregateField.sum('amount')}).get(),
          db.collection('gameMailOutbox').where('campaignId','==',campaignId).where('state','==','accepted').count().get(),
        ]);
        metrics={impressions:counts[0].data().count,opens:counts[1].data().count,starts:counts[2].data().count,completes:counts[3].data().count,prizes:counts[4].data().count,mailsAccepted:mails.data().count,orders:Number(paid.data().orders||0),revenue:Number(paid.data().revenue||0)};
      }else{
        // Original records predate campaignId and need to remain visible.
        const [events,conversions,mails]=await Promise.all([
          db.collection('gameEvents').where('brandId','==',brandId).get(),
          db.collection('gameConversions').where('brandId','==',brandId).get(),
          db.collection('gameMailOutbox').where('brandId','==',brandId).get(),
        ]);
        const belongs=(row:{campaignId?:string})=>(row.campaignId||brandId)===campaignId;
        const rows=events.docs.filter(doc=>belongs(doc.data()));
        const count=(event:string)=>rows.filter(doc=>doc.data().event===event).length;
        const paid=conversions.docs.filter(doc=>belongs(doc.data())&&doc.data().status==='paid');
        metrics={impressions:count('game_impression'),opens:count('game_open'),starts:count('game_start'),completes:count('game_complete'),prizes:count('prize_issued'),mailsAccepted:mails.docs.filter(doc=>belongs(doc.data())&&doc.data().state==='accepted').length,orders:paid.length,revenue:paid.reduce((total,doc)=>total+Number(doc.data().amount||0),0)};
      }
    }catch(error){
      const failure=error as {code?:unknown;message?:unknown};
      console.error('games_metrics_query_failed',{brandId,campaignId,code:String(failure?.code||'unknown'),message:String(failure?.message||'unknown').slice(0,500)});
    }
  }
  return <main className="space-y-4 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-semibold">Skrabelod · {saved?.campaignName||"Nyt spil"}</h1><div className="flex gap-4 text-sm"><Link className="underline" href="/superadmin/games">Alle spil</Link>{saved&&<Link className="underline" href={`/superadmin/games/participants?brand=${encodeURIComponent(brandId||'')}&campaign=${encodeURIComponent(campaignId)}`}>Deltagere</Link>}</div></div>
    <p className="text-muted-foreground">Opsæt spillet trin for trin, se gæstens oplevelse og test, før du aktiverer det.</p>
    {metrics?<section className="rounded-xl border bg-white p-5" aria-label="Kampagnens resultater"><h2 className="mb-3 text-lg font-semibold">Resultater</h2><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{([['Visninger',metrics.impressions],['Åbninger',metrics.opens],['Starter',metrics.starts],['Gennemførte',metrics.completes],['Udstedte præmier',metrics.prizes],['Mail accepteret',metrics.mailsAccepted],['Betalte køb',metrics.orders],['Omsætning',`${metrics.revenue.toLocaleString('da-DK')} kr.`],['Køb pr. gennemført spil',metrics.completes?`${(100*metrics.orders/metrics.completes).toFixed(1)} %`:'0 %']] as const).map(([label,value])=><div key={label} className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-600">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>)}</div><p className="mt-3 text-xs text-gray-600">Mail accepteret betyder, at notifikationsplatformen har modtaget anmodningen, ikke at kunden har modtaget mailen. Betalte køb kommer fra Orderfly eller en signeret ekstern ordrebekræftelse. Restaurantregistrering tilføjes senere.</p></section>:brandId?<p className="rounded-lg bg-amber-50 p-3 text-sm">Målinger er ikke tilgængelige endnu. Kontrollér Firestore-indekserne.</p>:null}
    {brandId ? <ScratchCardEditor key={campaignId} campaignId={campaignId} brands={brands} products={products} brandId={brandId} draft={draft} status={status} preset={!saved && !!draft}/> : <p>Du har ikke adgang til et brand med website-rettigheder.</p>}
  </main>;
}
