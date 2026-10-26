import { timingSafeEqual } from 'node:crypto';
import { runDeliveryDispatchWorker } from '@/lib/delivery/booking/dispatcher';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
  const secrets=[process.env.ORDERFLY_FEEDBACK_WORKER_SECRET,process.env.ORDERFLY_NOTIFICATION_SECRET].filter((v):v is string=>typeof v==='string'&&v.length>=32);
  const value=request.headers.get('authorization')||'';
  if(value.length>519||!secrets.some(secret=>{const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(value);return expected.length===actual.length&&timingSafeEqual(expected,actual);}))return Response.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
  try{return Response.json(await runDeliveryDispatchWorker(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Delivery worker unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
