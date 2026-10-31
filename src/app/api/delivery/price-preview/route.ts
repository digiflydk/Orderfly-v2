import {withDeliveryRequest} from '@/lib/delivery/quotes/request-context';
import {z} from 'zod';
import {getOrigin} from '@/lib/url';
import {getAdminDb} from '@/lib/firebase-admin';
import {loadDeliverySettingsInTransaction} from '@/lib/delivery/settings/server';
import {resolveManagedRoutingRuntime} from '@/lib/delivery/quotes/runtime';
import {normalizeDanishDeliveryAddress} from '@/lib/delivery/quotes/address';
import {resolveDeliveryRoute} from '@/lib/delivery/routing/service';
import {deliveryTariffPreview} from '@/lib/delivery/pricing/tariff-preview';
export const runtime='nodejs';
const id=z.string().min(1).max(160).regex(/^[^/\\?#]+$/);
const schema=z.object({brandId:id,locationId:id,street:z.string().min(1).max(250),zipCode:z.string().min(1).max(20),city:z.string().min(1).max(200)}).strict();
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){return withDeliveryRequest(()=>preview(request));}
async function preview(request:Request){
 const started=performance.now();
 if(request.headers.get('origin')!==await getOrigin()||request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({ok:false},403);
 try{
  const reader=request.body?.getReader();if(!reader)return reply({ok:false},400);let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply({ok:false},413);}chunks.push(value);}}finally{reader.releaseLock();}
  const parsed=schema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));if(!parsed.success)return reply({ok:false},400);
  const {brandId,locationId,...address}=parsed.data,scope={brandId,locationId};
  const [location,settings,routing]=await Promise.all([
   getAdminDb().collection('locations').doc(locationId).get(),
   getAdminDb().runTransaction(async tx=>(await loadDeliverySettingsInTransaction(tx,brandId,locationId)).result.settings,{readOnly:true}),
   resolveManagedRoutingRuntime(scope),
  ]);
  const l=location.data();if(!location.exists||l?.brandId!==brandId||l?.isActive!==true||!l.deliveryTypes?.includes('delivery')||!settings.enabled||settings.paused||!settings.pricingRules||!routing)return reply({ok:false});
  const pickup=normalizeDanishDeliveryAddress({street:l.street,postcode:l.zipCode,city:l.city,country:l.country});
  const dropoff=normalizeDanishDeliveryAddress({street:address.street,postcode:address.zipCode,city:address.city,country:l.country});
  const postal=(a:typeof pickup)=>({street:`${a.street} ${a.building}`.trim(),postalCode:a.postcode,city:a.city,countryCode:a.country});
  const result=await resolveDeliveryRoute({pickup:postal(pickup),dropoff:postal(dropoff),profile:'car'},{adapter:routing,now:()=>new Date(),scope});
  if(!result.ok||result.route.meters>settings.maxDistanceMeters)return reply({ok:false});
  const preview=deliveryTariffPreview(settings.pricingRules,result.route.meters);
  return reply(preview?{ok:true,...preview,...(result.receipt?{routeReceipt:result.receipt}:{}),routingSource:routing.source,serverMs:Math.round(performance.now()-started)}:{ok:false});
 }catch{return reply({ok:false});}
}
