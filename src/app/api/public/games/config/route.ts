import { getAdminDb } from '@/lib/firebase-admin';
import { scratchCardDraftSchema, scratchCardOnPage } from '@/lib/games/scratch-card';
export const runtime='nodejs';
export async function GET(request:Request){
  const url=new URL(request.url),slug=url.searchParams.get('brand')||'',pathname=url.searchParams.get('path')||'/';
  if(!/^[a-z0-9-]{1,100}$/.test(slug)||!/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(pathname))return Response.json({error:'Invalid request'},{status:400});
  const db=getAdminDb(),brands=await db.collection('brands').where('slug','==',slug).limit(2).get();
  if(brands.size!==1)return Response.json({error:'Not found'},{status:404});
  const brand=brands.docs[0],snap=await db.collection('gameScratchDrafts').doc(brand.id).get(),parsed=scratchCardDraftSchema.safeParse(snap.data());
  if(snap.data()?.status!=='live'||!parsed.success||!scratchCardOnPage(parsed.data,pathname))return Response.json({error:'Not found'},{status:404});
  return Response.json({game:{...parsed.data,logoUrl:parsed.data.logoUrl||String(brand.data().logoUrl||'')},brandName:String(brand.data().name||slug)},{headers:{'Cache-Control':'no-store'}});
}
