import { z } from 'zod';
import { QrStoreError } from './store';
import { QrPayloadError } from './payload';
import { QrRenderError } from './render';
import { QrAnalyticsError } from './analytics';
import { QrHistoryError } from './history';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function qrAdminHttp(request:Request,deps:{origin:string;execute:(command:unknown)=>Promise<unknown>}) {
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 if(request.headers.get('origin')!==deps.origin||request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({error:'forbidden'},403);
 const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_input'},400);
 let raw:unknown;
 try{
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>3*1024*1024)return reply({error:'invalid_input'},413);chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }catch{return reply({error:'invalid_input'},400);}
 try{return reply(await deps.execute(raw));}
 catch(error){
  if(error instanceof z.ZodError||error instanceof QrPayloadError||error instanceof QrRenderError)return reply({error:'invalid_input'},400);
  if(error instanceof QrStoreError||error instanceof QrAnalyticsError||error instanceof QrHistoryError)return reply({error:error.status===400?'invalid_input':error.status===403?'forbidden':error.code},error.status);
  const e=error as {name?:string;status?:number;code?:string};
  if(e.name==='AuthorityError'||['unauthorized','forbidden','identity_unavailable'].includes(e.code||''))return reply({error:e.status===401?'unauthorized':e.status===403?'forbidden':'unavailable'},e.status===401?401:e.status===403?403:503);
  return reply({error:'unavailable'},503);
 }
}
