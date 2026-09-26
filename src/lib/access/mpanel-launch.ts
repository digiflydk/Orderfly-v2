import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { AuthorityError, executeAuthority, type VerifiedIdentity } from './authority';
import { createOpsflyCookie, nativeOpsflySession } from './opsfly-login';

export const launchNonce = z.string().regex(/^[0-9a-f]{64}$/);
export const launchCode = z.string().regex(/^[0-9a-f]{64}\.[0-9a-f]{64}$/);
export const challengeCookie = '__Host-mpanel-challenge';
export const challengeLifetime = 120;
const lifetime = 60_000;
const digest = (value:string) => createHash('sha256').update(value).digest('hex');
const bootstrap = ():VerifiedIdentity => ({provider:'opsfly', subject:process.env.MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID||'', organizationId:process.env.MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID||''});
function key() {
  const secret=process.env.MPANEL_PLATFORM_ADMIN_SECRET;
  if(!secret || secret.length<32)throw new AuthorityError('service_unavailable',503);
  return createHmac('sha256',secret).update('orderfly-mpanel-launch:v1').digest();
}
function seal(token:string, slot:string) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
  cipher.setAAD(Buffer.from(slot));
  const data=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');
}
function unseal(value:string,slot:string) {
  const bytes=Buffer.from(value,'base64url');
  const cipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));
  cipher.setAAD(Buffer.from(slot));cipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');
}
const destinations=[
  ['orderfly.orders:view','/superadmin/sales/orders'],
  ['orderfly.catalog:view','/superadmin/products'],
  ['orderfly.customers:view','/superadmin/customers'],
  ['orderfly.discounts:view','/superadmin/discounts'],
  ['orderfly.feedback:view','/superadmin/feedback'],
  ['orderfly.loyalty:view','/superadmin/loyalty'],
  ['orderfly.analytics:view','/superadmin/analytics/cust-funnel'],
  ['orderfly.website:view','/superadmin/brands/websites'],
  ['orderfly.billing:view','/superadmin/billing'],
] as const;
export async function checkLaunchAccess(db:Firestore,token:string) {
  const native=await nativeOpsflySession(token);
  const access=await executeAuthority(db,native.identity,{action:'session'},bootstrap());
  if(!('permissions' in access)||!('superuser' in access))throw new AuthorityError('forbidden');
  const target=access.superuser?destinations[0]:destinations.find(([permission])=>access.permissions.includes(permission));
  if(!target)throw new AuthorityError('forbidden');
  return {native,path:target[1]};
}
export async function issueLaunch(db:Firestore,token:string,challenge:string) {
  launchNonce.parse(challenge);
  const {native}=await checkLaunchAccess(db,token);
  // One bounded slot per verified identity. Opening another launch invalidates
  // the old one; no unbounded collection of expired credentials is retained.
  const slot=digest(JSON.stringify(native.identity)),secret=randomBytes(32).toString('hex');
  await db.collection('platformAdminControl').doc('mpanel-launch-'+slot).set({
    codeHash:digest(secret),challengeHash:digest(challenge),
    sealedToken:seal(token,slot),expires:Date.now()+lifetime,
  });
  return {code:slot+'.'+secret};
}
export async function redeemLaunch(db:Firestore,code:string,challenge:string) {
  launchCode.parse(code);launchNonce.parse(challenge);
  const [slot,secret]=code.split('.'),ref=db.collection('platformAdminControl').doc('mpanel-launch-'+slot);
  // Consume before external authorization. Rejection or a network failure burns
  // the code safely; the user can start a fresh launch.
  const encrypted=await db.runTransaction(async tx=>{
    const data=(await tx.get(ref)).data();
    if(!data || typeof data.expires!=='number' || data.expires<=Date.now() || data.expires>Date.now()+lifetime ||
       typeof data.codeHash!=='string' || !launchNonce.safeParse(data.codeHash).success ||
       !timingSafeEqual(Buffer.from(data.codeHash),Buffer.from(digest(secret))) ||
       data.challengeHash!==digest(challenge) || typeof data.sealedToken!=='string')throw new AuthorityError('forbidden');
    tx.delete(ref);return data.sealedToken;
  });
  const token=unseal(encrypted,slot),{native,path}=await checkLaunchAccess(db,token);
  return {cookie:createOpsflyCookie(token,native.expires_at),path};
}

export async function launchBody(request:Request,max=2048):Promise<unknown> {
  const reader=request.body?.getReader();if(!reader)throw new Error('body');
  const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max)throw new Error('body');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
