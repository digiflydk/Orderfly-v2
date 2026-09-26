import { z } from 'zod';
import { GameError, playScratchCard } from '@/lib/games/play';
export const runtime='nodejs';
const input=z.object({brandId:z.string(),name:z.string(),email:z.string(),phone:z.string().optional(),newsletter:z.boolean(),pathname:z.string(),test:z.boolean().optional()});
export async function POST(request:Request){
  try {
    if(Number(request.headers.get('content-length')||0)>4096)return Response.json({error:'For stor anmodning.'},{status:413});
    const parsed=input.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:'Ugyldige oplysninger.'},{status:400});
    const ip=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,64);
    const result=await playScratchCard(parsed.data,ip);
    return Response.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch(error){
    const status=error instanceof GameError?error.status:500;
    return Response.json({error:error instanceof GameError?error.message:'Spillet er midlertidigt utilgængeligt.'},{status,headers:{'Cache-Control':'no-store'}});
  }
}
