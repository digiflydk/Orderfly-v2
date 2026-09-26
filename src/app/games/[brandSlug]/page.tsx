import { notFound } from 'next/navigation';
import { getAdminDb } from '@/lib/firebase-admin';
import { scratchCardDraftSchema } from '@/lib/games/scratch-card';
import { ScratchGame } from '@/components/games/ScratchGame';
export const dynamic='force-dynamic';
export default async function GamePage({params}:{params:Promise<{brandSlug:string}>}){
  const {brandSlug}=await params;
  if(!/^[a-z0-9-]{1,100}$/.test(brandSlug))notFound();
  const db=getAdminDb(),brands=await db.collection('brands').where('slug','==',brandSlug).limit(2).get();
  if(brands.size!==1)notFound();
  const brand=brands.docs[0],snap=await db.collection('gameScratchDrafts').doc(brand.id).get();
  const parsed=scratchCardDraftSchema.safeParse(snap.data());
  if(snap.data()?.status!=='live'||!parsed.success)notFound();
  return <main className="min-h-screen bg-neutral-950 px-4 py-12"><ScratchGame game={{...parsed.data,logoUrl:parsed.data.logoUrl||String(brand.data().logoUrl||'')}} brandName={String(brand.data().name||brandSlug)} pathname="/games"/></main>;
}
