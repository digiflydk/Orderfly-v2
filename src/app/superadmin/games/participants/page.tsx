import Link from '@/components/superadmin/admin-link';
import { getAdminDb } from '@/lib/firebase-admin';
import { gameBrands } from '../actions';
import { scratchCardDraftSchema } from '@/lib/games/scratch-card';
import { ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { marketingConfig } from '@/lib/marketing/config';
import { retryGameNewsletter } from './actions';

export const dynamic='force-dynamic';
const PAGE_SIZE=50;
export default async function ParticipantsPage({searchParams}:{searchParams:Promise<{brand?:string;campaign?:string;page?:string}>}){
  const query=await searchParams,brands=await gameBrands();
  const brand=brands.find(row=>row.id===query.brand),campaignId=query.campaign||'';
  if(!brand||!/^[A-Za-z0-9_-]{1,128}$/.test(campaignId))return <main className="p-6"><p>Vælg en kampagne fra <Link className="underline" href="/superadmin/games">Games</Link>.</p></main>;
  const db=getAdminDb(),campaign=await db.collection('gameScratchDrafts').doc(campaignId).get(),omnisendReady=!!marketingConfig(brand.id);
  const parsed=scratchCardDraftSchema.safeParse(campaign.data());
  if(!parsed.success||parsed.data.brandId!==brand.id)return <main className="p-6">Kampagnen findes ikke for dette brand.</main>;
  const page=Math.min(20,Math.max(1,Number.parseInt(query.page||'1',10)||1));
  // Older plays have no campaignId. They belong to the original brand-id campaign.
  const legacy=campaignId===brand.id;
  const result=legacy
    ? await db.collection('gamePlays').where('brandId','==',brand.id).get()
    : await db.collection('gamePlays').where('campaignId','==',campaignId).where('mode','==','live').orderBy('createdAt','desc').offset((page-1)*PAGE_SIZE).limit(PAGE_SIZE+1).get();
  const all=legacy?result.docs.filter(doc=>doc.data().mode==='live'&&(doc.data().campaignId||brand.id)===campaignId)
    .sort((a,b)=>(b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0)):result.docs;
  const rows=legacy?all.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE):all.slice(0,PAGE_SIZE),hasNext=legacy?page*PAGE_SIZE<all.length:all.length>PAGE_SIZE;
  const count=legacy?all.length:(await db.collection('gamePlays').where('campaignId','==',campaignId).where('mode','==','live').count().get()).data().count;
  const mail=await Promise.all(rows.map(row=>db.collection('gameMailOutbox').doc(row.id).get()));
  const consent=await Promise.all(rows.map(row=>row.data().newsletter?db.collection('gameConsentOutbox').doc(row.id).get():null));
  const vouchers=await Promise.all(rows.map(row=>db.collection('gameVouchers').where('playId','==',row.id).limit(1).get()));
  const conversions=await Promise.all(rows.map(row=>db.collection('gameConversions').where('playId','==',row.id).limit(1).get()));
  const completed=await Promise.all(rows.map(row=>db.collection('gameEvents').doc(`${String(row.data().eventId||'')}_game_complete`).get()));
  const date=(value:{toDate?:()=>Date}|undefined)=>value?.toDate?.()?new Intl.DateTimeFormat('da-DK',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(value.toDate()):'—';
  const href=(number:number)=>`/superadmin/games/participants?brand=${encodeURIComponent(brand.id)}&campaign=${encodeURIComponent(campaignId)}&page=${number}`;
  const entries=rows.map((row,index)=>{const item=row.data(),state=mail[index].data()?.state,voucher=vouchers[index].docs[0]?.data(),purchase=conversions[index].docs.find(doc=>doc.data().status==='paid')?.data();const consentState=consent[index]?.data()?.state;return {
    id:row.id,date:date(item.createdAt),name:String(item.name||''),email:String(item.email||''),newsletter:!item.newsletter?'Ikke tilvalgt':consentState==='synced'?'Synkroniseret':consentState==='accepted'?'Ingen ændring i Omnisend':consentState==='suppressed'?'Afmeldt i Omnisend':consentState==='uncertain'?'Kræver kontrol':consentState==='failed'?'Fejlet':'Afventer Omnisend',
    retryNewsletter:omnisendReady&&item.newsletter===true&&(consentState==='failed'||consentState==='pending'&&consent[index]?.data()?.lastError==='configuration_required'),
    game:completed[index].exists?'Gennemført':'Startet',prize:Number.isInteger(item.prizeIndex)?parsed.data.prizes[item.prizeIndex]?.name||'Ukendt':'Ingen gevinst',
    code:voucher?.state==='redeemed'?'Indløst':voucher?'Udstedt':'—',
    emailStatus:state==='accepted'?'Accepteret af platformen':state==='pending'||state==='dispatching'?'Afventer':state==='failed'||state==='uncertain'?'Kræver kontrol':state==='synced'?'Afsendt':'—',
    purchase:purchase?`${Number(purchase.amount||0).toLocaleString('da-DK')} kr.`:'—',
  };});
  return <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <Button variant="ghost" size="sm" asChild className="-ml-2"><Link href="/superadmin/games"><ArrowLeft className="mr-2 h-4 w-4"/>Alle spil</Link></Button>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Deltagere</h1><p className="mt-1 text-sm text-muted-foreground">{parsed.data.campaignName} · {brand.name}</p></div><Button variant="outline" size="sm" asChild><Link href={`/superadmin/games/scratch-card?brand=${encodeURIComponent(brand.id)}&campaign=${encodeURIComponent(campaignId)}`}>Åbn kampagne</Link></Button></div>
    <Card><CardContent className="flex items-center gap-3 p-4 sm:p-5"><Users className="h-5 w-5 text-muted-foreground" aria-hidden="true"/><div><p className="text-xl font-semibold tabular-nums">{count.toLocaleString('da-DK')} deltagere</p><p className="text-sm text-muted-foreground">Testspil tælles ikke med. Nyhedsbrev viser udfaldet af frivilligt samtykke i Omnisend.{!omnisendReady&&' Omnisend er endnu ikke aktiveret for dette brand.'}</p></div></CardContent></Card>
    <div className="space-y-3 lg:hidden">{entries.map(entry=><Card key={entry.id}><CardContent className="space-y-3 p-4"><div><p className="font-semibold">{entry.name}</p><p className="break-all text-sm text-muted-foreground">{entry.email}</p><p className="mt-1 text-xs text-muted-foreground">{entry.date}</p></div><div className="grid grid-cols-2 gap-3 text-sm">{([['Spil',entry.game],['Præmie',entry.prize],['Kode',entry.code],['Mail',entry.emailStatus],['Nyhedsbrev',entry.newsletter],['Køb',entry.purchase]] as const).map(([label,value])=><div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>)}</div>{entry.retryNewsletter&&<form action={retryGameNewsletter}><input type="hidden" name="brandId" value={brand.id}/><input type="hidden" name="playId" value={entry.id}/><Button size="sm" variant="outline">Prøv Omnisend igen</Button></form>}</CardContent></Card>)}</div>
    <div className="hidden overflow-hidden rounded-lg border bg-card lg:block"><table className="w-full table-fixed text-left text-sm"><thead className="border-b bg-muted/40"><tr><th scope="col" className="w-[25%] px-4 py-3 font-semibold">Deltager</th><th scope="col" className="w-[16%] px-4 py-3 font-semibold">Spil</th><th scope="col" className="w-[16%] px-4 py-3 font-semibold">Præmie og kode</th><th scope="col" className="w-[27%] px-4 py-3 font-semibold">Mail og samtykke</th><th scope="col" className="w-[16%] px-4 py-3 font-semibold">Køb</th></tr></thead><tbody>{entries.map(entry=><tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30"><td className="px-4 py-3 align-top"><p className="font-medium">{entry.name}</p><p className="break-all text-xs text-muted-foreground">{entry.email}</p></td><td className="px-4 py-3 align-top"><p>{entry.game}</p><p className="mt-1 text-xs text-muted-foreground">{entry.date}</p></td><td className="px-4 py-3 align-top"><p className="font-medium">{entry.prize}</p><p className="mt-1 text-xs text-muted-foreground">Kode: {entry.code}</p></td><td className="px-4 py-3 align-top"><p>{entry.emailStatus}</p><p className="mt-1 text-xs text-muted-foreground">Nyhedsbrev: {entry.newsletter}</p>{entry.retryNewsletter&&<form action={retryGameNewsletter} className="mt-2"><input type="hidden" name="brandId" value={brand.id}/><input type="hidden" name="playId" value={entry.id}/><Button size="sm" variant="outline">Prøv Omnisend igen</Button></form>}</td><td className="px-4 py-3 align-top">{entry.purchase}</td></tr>)}</tbody></table></div>
    {!entries.length&&<div className="rounded-lg border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">Ingen deltagere endnu.</div>}
    <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Side {page}</span><div className="flex gap-2">{page>1&&<Button variant="outline" size="sm" asChild><Link href={href(page-1)}>Forrige</Link></Button>}{hasNext&&<Button variant="outline" size="sm" asChild><Link href={href(page+1)}>Næste</Link></Button>}</div></div>
  </main>;
}
