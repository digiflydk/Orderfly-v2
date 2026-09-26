import { notFound } from 'next/navigation';
import { getAdminDb } from '@/lib/firebase-admin';
import { scratchCardDraftSchema, publicScratchGame } from '@/lib/games/scratch-card';
import { ScratchGame } from '@/components/games/ScratchGame';
import { headers } from 'next/headers';
import { scratchCardOnPage } from '@/lib/games/scratch-card';
export const dynamic='force-dynamic';
export default async function GamePage({params,searchParams}:{params:Promise<{brandSlug:string}>;searchParams:Promise<{embed?:string;path?:string}>}){
  const {brandSlug}=await params;
  if(!/^[a-z0-9-]{1,100}$/.test(brandSlug))notFound();
  const db=getAdminDb(),brands=await db.collection('brands').where('slug','==',brandSlug).limit(2).get();
  if(brands.size!==1)notFound();
  const brand=brands.docs[0],snap=await db.collection('gameScratchDrafts').doc(brand.id).get();
  const parsed=scratchCardDraftSchema.safeParse(snap.data());
  if(snap.data()?.status!=='live'||!parsed.success)notFound();
  const query=await searchParams,embedded=query.embed==='1';
  let pathname='/games',embedOrigin: string|undefined;
  if(embedded){
    const referrer=(await headers()).get('referer')||'';
    try{embedOrigin=new URL(referrer).origin;}catch{notFound();}
    if(!parsed.data.allowedOrigins.includes(embedOrigin)||!query.path||!/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(query.path)||!scratchCardOnPage(parsed.data,query.path))notFound();
    pathname=query.path;
  }
  return <main className={`bg-neutral-950 px-4 py-8 ${embedded?'min-h-0':'min-h-screen py-12'}`}><ScratchGame game={publicScratchGame({...parsed.data,logoUrl:parsed.data.logoUrl||String(brand.data().logoUrl||'')})} brandName={String(brand.data().name||brandSlug)} pathname={pathname} embedOrigin={embedOrigin}/></main>;
}
