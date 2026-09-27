import Link from '@/components/superadmin/admin-link';
import { getAdminDb } from '@/lib/firebase-admin';
import { gameBrands } from '../actions';
import { scratchCardDraftSchema } from '@/lib/games/scratch-card';

export const dynamic='force-dynamic';
const PAGE_SIZE=50;
export default async function ParticipantsPage({searchParams}:{searchParams:Promise<{brand?:string;campaign?:string;page?:string}>}){
  const query=await searchParams,brands=await gameBrands();
  const brand=brands.find(row=>row.id===query.brand),campaignId=query.campaign||'';
  if(!brand||!/^[A-Za-z0-9_-]{1,128}$/.test(campaignId))return <main className="p-6"><p>Vælg en kampagne fra <Link className="underline" href="/superadmin/games">Games</Link>.</p></main>;
  const db=getAdminDb(),campaign=await db.collection('gameScratchDrafts').doc(campaignId).get();
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
  const vouchers=await Promise.all(rows.map(row=>db.collection('gameVouchers').where('playId','==',row.id).limit(1).get()));
  const conversions=await Promise.all(rows.map(row=>db.collection('gameConversions').where('playId','==',row.id).limit(1).get()));
  const completed=await Promise.all(rows.map(row=>db.collection('gameEvents').doc(`${String(row.data().eventId||'')}_game_complete`).get()));
  const date=(value:{toDate?:()=>Date}|undefined)=>value?.toDate?.()?new Intl.DateTimeFormat('da-DK',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(value.toDate()):'—';
  const href=(number:number)=>`/superadmin/games/participants?brand=${encodeURIComponent(brand.id)}&campaign=${encodeURIComponent(campaignId)}&page=${number}`;
  return <main className="space-y-5 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-semibold">Deltagere</h1><p className="mt-1 text-gray-600">{parsed.data.campaignName} · {brand.name}</p></div><Link className="text-sm underline" href={`/superadmin/games/scratch-card?brand=${encodeURIComponent(brand.id)}&campaign=${encodeURIComponent(campaignId)}`}>Tilbage til kampagnen</Link></div>
    <p className="text-sm text-gray-600">{count} deltagere. Testspil er ikke medregnet. Nyhedsbrev er frivilligt og vises som registreret samtykke.</p>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b bg-gray-50"><tr>{['Dato','Navn','E-mail','Nyhedsbrev','Spil','Præmie','Kode','Gevinstmail','Køb'].map(label=><th scope="col" className="px-4 py-3 font-semibold" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row,index)=>{const item=row.data(),prize=Number.isInteger(item.prizeIndex)?parsed.data.prizes[item.prizeIndex]?.name||'Ukendt':'Ingen gevinst',state=mail[index].data()?.state,voucher=vouchers[index].docs[0]?.data(),purchase=conversions[index].docs.find(doc=>doc.data().status==='paid')?.data();return <tr key={row.id} className="border-b last:border-0"><td className="whitespace-nowrap px-4 py-3">{date(item.createdAt)}</td><td className="px-4 py-3">{String(item.name||'')}</td><td className="px-4 py-3">{String(item.email||'')}</td><td className="px-4 py-3">{item.newsletter?'Ja':'Nej'}</td><td className="px-4 py-3">{completed[index].exists?'Gennemført':'Startet'}</td><td className="px-4 py-3">{prize}</td><td className="px-4 py-3">{voucher?.state==='redeemed'?'Indløst':voucher?'Udstedt':'—'}</td><td className="px-4 py-3">{state==='accepted'?'Accepteret af platformen':state==='pending'||state==='dispatching'?'Afventer':state==='failed'||state==='uncertain'?'Kræver kontrol':state==='synced'?'Afsendt':'—'}</td><td className="px-4 py-3">{purchase?`${Number(purchase.amount||0).toLocaleString('da-DK')} kr.`:'—'}</td></tr>;})}</tbody></table>{!rows.length&&<p className="p-5 text-sm text-gray-600">Ingen deltagere endnu.</p>}</div>
    <div className="flex items-center justify-between text-sm"><span>Side {page}</span><div className="flex gap-4">{page>1&&<Link className="underline" href={href(page-1)}>Forrige</Link>}{hasNext&&<Link className="underline" href={href(page+1)}>Næste</Link>}</div></div>
  </main>;
}
