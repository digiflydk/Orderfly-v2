import 'server-only';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFeedbackAccess, assertFeedbackBrand, canEditFeedbackBrand } from './access';
import { fetchGoogleReviews, type GoogleReview } from './google-client';
const id = z.string().regex(/^[\w-]{1,160}$/);
const connection = z.object({brandId:id, locationId:id, parent:z.string().regex(/^accounts\/\d+\/locations\/\d+$/), refreshToken:z.string().min(1)});
function configuration(brandId:string, locationId:string) {
  try {
    const connections = z.array(connection).parse(JSON.parse(process.env.GOOGLE_FEEDBACK_CONNECTIONS || '[]'));
    const matches = connections.filter(c=>c.brandId===brandId && c.locationId===locationId);
    return matches.length===1 && process.env.GOOGLE_FEEDBACK_CLIENT_ID && process.env.GOOGLE_FEEDBACK_CLIENT_SECRET ? matches[0] : null;
  } catch { return null; }
}
async function scope(brandId:string, locationId:string, edit=false) {
  id.parse(brandId); id.parse(locationId);
  const access = await requireFeedbackAccess(edit?'feedback:edit':'feedback:view');
  assertFeedbackBrand(access,brandId);
  if(edit && !canEditFeedbackBrand(access,brandId)) throw new Error('FORBIDDEN');
  const db=getAdminDb();
  const [brand,location]=await Promise.all([db.collection('brands').doc(brandId).get(),db.collection('locations').doc(locationId).get()]);
  if(brand.data()?.status!=='active' || location.data()?.brandId!==brandId || location.data()?.isActive===false) throw new Error('FORBIDDEN');
  return {access,ref:db.collection('googleFeedbackImports').doc(locationId)};
}
export async function readGoogleImport(brandId:string, locationId:string) {
  const {ref}=await scope(brandId,locationId);
  const data=(await ref.get()).data();
  const valid=data?.brandId===brandId && data?.expiresAt?.toMillis()>Date.now();
  return {configured:Boolean(configuration(brandId,locationId)), status: data?.brandId===brandId ? String(data.status || 'never') : 'never', importedAt:data?.brandId===brandId ? data.importedAt?.toDate().toISOString() ?? null : null, reviews:valid ? data!.reviews as GoogleReview[] : []};
}
export async function importGoogleReviews(brandId:string,locationId:string) {
  const {ref,access}=await scope(brandId,locationId,true);
  const config=configuration(brandId,locationId);
  if(!config) return {ok:false,message:'Google-forbindelsen mangler. API-adgang og OAuth skal konfigureres på serveren.'};
  const db=getAdminDb(), now=Date.now(), runId=crypto.randomUUID();
  const locked=await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data();
    if(current?.leaseUntil?.toMillis()>now) return false;
    tx.set(ref,{brandId,locationId,status:'running',runId,leaseUntil:new Date(now+1800000),expiresAt:current?.expiresAt ?? new Date(now+29*86400000)},{merge:true}); return true;
  });
  if(!locked) return {ok:false,message:'En import er allerede i gang.'};
  try {
    const client=new OAuth2Client(process.env.GOOGLE_FEEDBACK_CLIENT_ID,process.env.GOOGLE_FEEDBACK_CLIENT_SECRET);
    client.setCredentials({refresh_token:config.refreshToken});
    const token=await client.getAccessToken(); if(!token.token) throw new Error('GOOGLE_AUTH');
    const reviews=await fetchGoogleReviews(config.parent,token.token);
    if(Buffer.byteLength(JSON.stringify(reviews),'utf8')>800000) throw new Error('GOOGLE_LIMIT');
    await db.runTransaction(async tx=>{
      const current=(await tx.get(ref)).data(); if(current?.runId!==runId) throw new Error('STALE_IMPORT');
      tx.set(ref,{brandId,locationId,reviews,status:'success',importedAt:new Date(),expiresAt:new Date(Date.now()+29*86400000),importedBy:access.uid});
    });
    return {ok:true,message:`${reviews.length} femstjernede anmeldelser er hentet.`};
  } catch(error) {
    const code=error instanceof Error && ['GOOGLE_AUTH','GOOGLE_ACCESS','GOOGLE_QUOTA','GOOGLE_LIMIT'].includes(error.message)?error.message:'GOOGLE_UNAVAILABLE';
    await db.runTransaction(async tx=>{const current=(await tx.get(ref)).data(); if(current?.runId===runId) tx.set(ref,{status:code,leaseUntil:new Date(0)},{merge:true});});
    return {ok:false,message:code==='GOOGLE_ACCESS'?'Google afviser API-adgangen. Kontrollér projektgodkendelse og adgang til lokationen.':code==='GOOGLE_AUTH'?'Google-login skal fornyes.':code==='GOOGLE_QUOTA'?'Google-kvoten er nået. Prøv senere.':'Importen kunne ikke gennemføres. Tidligere data er ikke erstattet.'};
  }
}
