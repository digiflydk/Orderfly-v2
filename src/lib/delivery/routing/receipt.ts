import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import type {RoutingAdapter,RoutingResult} from './service';
const ttl=30000;
/** A route-only receipt. Domain-separated MAC; no payment or checkout authority.
 * The active routing credential is loaded server-side, so rotation invalidates receipts.
 * No extra persisted customer data, signing secret or serial database lookup. */
export function withRouteReceipts(adapter:RoutingAdapter,credential:string):RoutingAdapter {
 const key=createHmac('sha256',credential).update('orderfly/route-receipt/v1').digest();
 const mac=(payload:string)=>createHmac('sha256',key).update(payload).digest();
 return {...adapter,receipts:{
  issue(identity,result,now){
   if(!result.ok)return undefined;
   const body=Buffer.from(JSON.stringify({v:1,identity,at:now,result})).toString('base64url');
   return body+'.'+mac(body).toString('base64url');
  },
  verify(receipt,identity,now){
   try{
    if(typeof receipt!=='string'||receipt.length>8192)return null;
    const parts=receipt.split('.');if(parts.length!==2||!parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)))return null;
    const signature=Buffer.from(parts[1],'base64url'),expected=mac(parts[0]);
    if(signature.length!==expected.length||!timingSafeEqual(signature,expected))return null;
    const value=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    if(value.v!==1||value.identity!==identity||!Number.isSafeInteger(value.at)||now<value.at||now>=value.at+ttl||!value.result?.ok)return null;
    const result=value.result as Extract<RoutingResult,{ok:true}>;
    if(result.route.source!==adapter.source||Date.parse(result.route.calculatedAt)>now||now-Date.parse(result.route.calculatedAt)>=ttl)return null;
    return result;
   }catch{return null;}
  }
 }};
}
