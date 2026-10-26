import 'server-only';
import {ZodError} from 'zod';
import {AuthorityError} from '@/lib/access/authority';
import {requirePlatformSuperuser} from '@/lib/access/orderfly-session';
import {getOrigin} from '@/lib/url';
import {listDeliveryMerchants,getDeliveryMerchant,createDeliveryMerchant,updateDeliveryMerchant,actOnDeliveryMerchant,DeliveryManagementError} from './service';
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store',Vary:'Cookie'}});
const allowedExternal=new Set(['secret_permission_denied','secret_configuration_missing','secret_store_unavailable','secret_reference_mismatch','invalid_secret_input','wolt_authentication_failed','wolt_connection_unavailable','wolt_webhook_ownership_conflict','wolt_webhook_configuration_mismatch','invalid_wolt_configuration']);
function error(error:unknown){
 if(error instanceof AuthorityError)return reply({error:error.status===401?'unauthorized':'forbidden'},error.status===401?401:403);
 if(error instanceof ZodError)return reply({error:'invalid_request'},400);
 if(error instanceof DeliveryManagementError)return reply({error:error.code},error.status);
 const code=error&&typeof error==='object'&&'code'in error?error.code:null;
 if(typeof code==='string'&&allowedExternal.has(code))return reply({error:code},503);
 return reply({error:'configuration_unavailable'},503);
}
async function body(request:Request){
 if(request.headers.get('origin')!==await getOrigin()||request.headers.get('sec-fetch-site')==='cross-site')throw new AuthorityError('forbidden');
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))throw new DeliveryManagementError('invalid_request',400);
 const reader=request.body?.getReader();if(!reader)throw new DeliveryManagementError('invalid_request',400);
 let size=0;const chunks:Uint8Array[]=[];
 for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>16384){await reader.cancel().catch(()=>{});throw new DeliveryManagementError('invalid_request',400);}chunks.push(chunk.value);}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new DeliveryManagementError('invalid_request',400);}
}
export async function merchantCollection(request:Request){try{
 await requirePlatformSuperuser();if(request.headers.get('sec-fetch-site')==='cross-site')throw new AuthorityError('forbidden');
 const url=new URL(request.url);
 if(request.method==='GET'){
  if([...url.searchParams.keys()].some(k=>!['brandId','locationId','cursor','includeArchived'].includes(k))||['brandId','locationId','cursor','includeArchived'].some(k=>url.searchParams.getAll(k).length>1))throw new DeliveryManagementError('invalid_request',400);
  return reply(await listDeliveryMerchants(Object.fromEntries(url.searchParams)));
 }
 if(request.method!=='POST'||url.search)throw new DeliveryManagementError('invalid_request',400);
 return reply(await createDeliveryMerchant(await body(request)),201);
}catch(e){return error(e);}}
export async function merchantItem(request:Request,id:string){try{
 await requirePlatformSuperuser();if(new URL(request.url).search||request.headers.get('sec-fetch-site')==='cross-site')throw new DeliveryManagementError('invalid_request',400);
 if(request.method==='GET')return reply(await getDeliveryMerchant(id));
 if(request.method!=='PUT')throw new DeliveryManagementError('invalid_request',400);
 return reply(await updateDeliveryMerchant(id,await body(request)));
}catch(e){return error(e);}}
export async function merchantAction(request:Request,id:string){try{
 await requirePlatformSuperuser();if(request.method!=='POST'||new URL(request.url).search)throw new DeliveryManagementError('invalid_request',400);
 return reply(await actOnDeliveryMerchant(id,await body(request)));
}catch(e){return error(e);}}
