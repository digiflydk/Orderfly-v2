import { timingSafeEqual } from 'node:crypto';
import { processWorldlineJobs } from '@/lib/payments/worldline-reconcile';
export const runtime='nodejs';
export async function POST(request:Request){
  const expected=process.env.ORDERFLY_PAYMENT_WORKER_SECRET||'',supplied=request.headers.get('x-payment-worker-secret')||'';
  if(expected.length<32||Buffer.byteLength(expected)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))return new Response('Unauthorized',{status:401});
  try{return Response.json(await processWorldlineJobs(),{headers:{'Cache-Control':'no-store'}});}catch{return new Response('Unavailable',{status:503});}
}
