import { AuthorityError } from '@/lib/access/authority';
import { readDeliveryOrders, DeliveryQueryError } from '@/lib/delivery/queries/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',Vary:'Cookie'}});
export async function GET(request:Request){
  try{const params=new URL(request.url).searchParams;if([...params.keys()].some(key=>params.getAll(key).length!==1))return reply({error:'delivery_query_invalid'},400);
    return reply(await readDeliveryOrders(Object.fromEntries(params)));
  }catch(error){
    if(error instanceof AuthorityError)return reply({error:error.status===401?'unauthorized':'forbidden'},error.status===401?401:403);
    if(error instanceof DeliveryQueryError)return reply({error:error.code},error.status);
    return reply({error:'delivery_unavailable'},503);
  }
}
