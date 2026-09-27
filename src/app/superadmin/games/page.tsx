import Link from '@/components/superadmin/admin-link';
import { getAdminDb } from '@/lib/firebase-admin';
import { gameBrands } from './actions';
import { scratchCardDraftSchema } from '@/lib/games/scratch-card';
import { brandCampaigns, campaignStatus } from '@/lib/games/campaign';
import { CreateCampaignButton } from '@/components/games/CreateCampaignButton';
export const dynamic='force-dynamic';
export default async function GamesPage(){
  const brands=await gameBrands(),db=getAdminDb();
  const campaigns=(await Promise.all(brands.map(async brand=>(await brandCampaigns(db,brand.id)).map(doc=>({doc,brand}))))).flat()
    .map(({doc,brand})=>{const game=scratchCardDraftSchema.parse(doc.data());return {id:doc.id,brand,game,status:campaignStatus(doc.data().status,game),count:Number(doc.data().playedCount||0)};});
  const format=(value:string|null)=>value?new Intl.DateTimeFormat('da-DK',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(new Date(value)):'—';
  return <main className="space-y-6 p-6">
    <div><h1 className="text-3xl font-semibold">Games</h1><p className="text-muted-foreground">Planlæg skrabelodder, følg deltagere og se tidligere kampagner.</p></div>
    {!campaigns.length&&<div className="rounded-xl border bg-white p-5">Ingen kampagner endnu. <Link className="underline" href="/superadmin/games/scratch-card">Opret det første skrabelod</Link>.</div>}
    {(['live','scheduled','paused','test','draft','ended'] as const).map(status=>{
      const rows=campaigns.filter(item=>item.status===status).sort((a,b)=>(b.game.startsAt||'').localeCompare(a.game.startsAt||''));
      if(!rows.length)return null;
      return <section key={status} className="rounded-xl border bg-white p-4 sm:p-6"><h2 className="mb-4 text-lg font-semibold">{{live:'Aktive spil',scheduled:'Planlagte spil',paused:'Pausede spil',test:'Spil i test',draft:'Kladder',ended:'Historiske spil'}[status]} ({rows.length})</h2><div className="grid gap-3 lg:grid-cols-2">{rows.map(item=><article key={item.id} className="rounded-lg border p-4"><div className="font-semibold">{item.game.campaignName}</div><p className="mt-1 text-sm text-gray-600">{item.brand.name} · Skrabelod</p><p className="mt-2 text-sm">Start: {format(item.game.startsAt)} · Slut: {format(item.game.endsAt)}</p><p className="mt-1 text-sm">Deltagere: {item.count} / {item.game.totalCardLimit}</p><div className="mt-3 flex gap-4 text-sm font-medium"><Link className="underline" href={`/superadmin/games/scratch-card?brand=${encodeURIComponent(item.brand.id)}&campaign=${encodeURIComponent(item.id)}`}>Opsætning og resultater</Link><Link className="underline" href={`/superadmin/games/participants?brand=${encodeURIComponent(item.brand.id)}&campaign=${encodeURIComponent(item.id)}`}>Deltagere</Link></div></article>)}</div></section>;
    })}
    {!!brands.length&&<section className="rounded-xl border bg-white p-4 sm:p-6"><h2 className="mb-3 text-lg font-semibold">Nyt spil</h2><div className="flex flex-wrap gap-3">{brands.map(brand=><CreateCampaignButton key={brand.id} brandId={brand.id} brandName={brand.name} hasBase={campaigns.some(row=>row.brand.id===brand.id&&row.id===brand.id)}/>)}</div></section>}
  </main>;
}
