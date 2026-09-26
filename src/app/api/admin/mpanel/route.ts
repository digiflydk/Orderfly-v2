import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrigin } from '@/lib/url';
import { mpanelAdminEnabled } from '@/lib/mpanel-admin-cutover';
import { getAdminDb } from '@/lib/firebase-admin';
import { challengeCookie, challengeLifetime, launchBody, launchCode, redeemLaunch } from '@/lib/access/mpanel-launch';
export const runtime='nodejs';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('start')}).strict(),
  z.object({action:z.literal('redeem'),code:launchCode}).strict(),
]);
const options={httpOnly:true,secure:true,sameSite:'strict' as const,path:'/'};
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request) {
  if(!mpanelAdminEnabled())return reply({error:'Unavailable'},503);
  if(request.headers.get('origin')!==await getOrigin()||request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return reply({error:'Forbidden'},403);
  try {
    const input=schema.parse(await launchBody(request));
    if(input.action==='start') {
      const challenge=randomBytes(32).toString('hex'),response=reply({challenge});
      response.cookies.set(challengeCookie,challenge,{...options,maxAge:challengeLifetime});return response;
    }
    const challenge=(await cookies()).get(challengeCookie)?.value;
    if(!challenge)return reply({error:'Start fra mPanel igen.'},403);
    const result=await redeemLaunch(getAdminDb(),input.code,challenge),response=reply({path:result.path});
    response.cookies.set('__session',result.cookie.value,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:result.cookie.maxAge});
    response.cookies.set(challengeCookie,'',{...options,maxAge:0});return response;
  } catch {return reply({error:'Orderfly kunne ikke åbnes. Start fra mPanel igen.'},403);}
}
