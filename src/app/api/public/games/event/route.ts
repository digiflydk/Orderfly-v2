import { z } from 'zod';
import { getAdminDb, admin } from '@/lib/firebase-admin';
import { scratchCardDraftSchema, scratchCardOnPage } from '@/lib/games/scratch-card';
import { liveCampaign } from '@/lib/games/campaign';

export const runtime='nodejs';
const eventInput=z.object({brandId:z.string().regex(/^[\w-]{1,128}$/),campaignId:z.string().regex(/^[\w-]{1,128}$/).optional(),event:z.enum(['game_impression','game_open','game_complete']),eventId:z.string().regex(/^[a-f0-9]{32}$/),pathname:z.string().regex(/^\/(?!\/)[a-zA-Z0-9/_-]*$/)}).strict();
export async function POST(request:Request){
  try{
    if(Number(request.headers.get('content-length')||0)>1024)return new Response(null,{status:413});
    const input=eventInput.safeParse(await request.json());
    if(!input.success)return new Response(null,{status:400});
    const {brandId,campaignId,event,eventId,pathname}=input.data,db=getAdminDb();
    const config=await liveCampaign(db,brandId),game=scratchCardDraftSchema.safeParse(config?.data());
    if(!config||campaignId&&campaignId!==config.id||!game.success||!(pathname==='/games'||scratchCardOnPage(game.data,pathname)))return new Response(null,{status:404});
    if(event==='game_complete'){
      const started=await db.collection('gameEvents').doc(eventId).get();
      if(!started.exists||started.data()?.brandId!==brandId||started.data()?.campaignId&&started.data()?.campaignId!==config.id||started.data()?.event!=='game_start')return new Response(null,{status:403});
    }
    const ref=db.collection('gameEvents').doc(`${eventId}_${event}`);
    await ref.create({brandId,campaignId:config.id,event,pathname,createdAt:admin.firestore.FieldValue.serverTimestamp()}).catch(error=>{if(error?.code!==6&&error?.code!=='already-exists')throw error;});
    return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
  }catch{return new Response(null,{status:503});}
}
