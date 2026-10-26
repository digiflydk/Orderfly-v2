import { AuthorityError } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { getOrigin } from '@/lib/url';
import { cancelManagedDelivery, DeliveryCancellationError } from '@/lib/delivery/cancellation/server';
export const runtime='nodejs';export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',Vary:'Cookie'}});
export async function POST(request:Request){
 try{
  await verifiedOrderflyIdentity();
  if(request.headers.get('origin')!==await getOrigin()||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'forbidden'},403);
  if(request.method!=='POST'||new URL(request.url).search||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))return reply({error:'invalid_request'},400);
  const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_request'},400);const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){try{await reader.cancel();}catch{}return reply({error:'invalid_request'},400);}chunks.push(value);}
  let body:unknown;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{return reply({error:'invalid_request'},400);}
  return reply(await cancelManagedDelivery(body));
 }catch(e){
  if(e instanceof AuthorityError&&[401,403].includes(e.status))return reply({error:e.status===401?'unauthorized':'forbidden'},e.status);
  if(e instanceof DeliveryCancellationError)return reply({error:e.code},e.status);
  return reply({error:'cancellation_unavailable'},503);
 }
}
