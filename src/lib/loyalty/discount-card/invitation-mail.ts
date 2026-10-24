import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { NotificationPlatformClient, NotificationPlatformError } from '@/lib/notifications/platform';
import { loyaltyMailConfig } from '@/lib/loyalty/stamp-card/mail';
import { LoyaltyError } from '@/lib/loyalty/stamp-card/counter';
import { INVITATIONS, readValidDiscountInvitation } from './invitations';
const NEVER=Number.MAX_SAFE_INTEGER;
export async function deliverDiscountInvitation(db:Firestore,id:string,now=Date.now(),client=new NotificationPlatformClient()){
 const ref=db.collection(INVITATIONS.outbox).doc(id),lease=randomUUID();
 const claimed=await db.runTransaction(async tx=>{
  const job=(await tx.get(ref)).data();
  if(!job||!['pending','failed'].includes(job.state)||job.nextAttemptAt>now)return null;
  try{await readValidDiscountInvitation(db,tx,String(job.brandId),id,now);}catch(e){
   if(!(e instanceof LoyaltyError))throw e;
   tx.update(ref,{state:'cancelled',invitationUrl:null,nextAttemptAt:NEVER,updatedAt:now});return null;
  }
  if(!job.invitationUrl||job.invitationId!==id)return null;
  const config=loyaltyMailConfig(String(job.brandId));
  if(!config){tx.update(ref,{nextAttemptAt:now+60_000,lastError:'mail_configuration_required'});return null;}
  tx.update(ref,{state:'dispatching',lease,nextAttemptAt:NEVER,updatedAt:now});return {job,config};
 });
 if(!claimed)return null;
 const {job,config}=claimed;
 let update:Record<string,unknown>;
 try{
  await client.send({idempotencyKey:`discount-invitation-${id}`,templateKey:'orderfly.discount_card.invitation',organizationId:config.organizationId,senderProfile:config.senderProfile,locale:'da',recipientEmail:job.email,recipientName:job.name,relatedEntity:{type:'discount_invitation',id},variables:{brand_id:job.brandId,brand_name:job.brandName,group_name:job.groupName,name:job.name,percentage:job.percentage,invitation_url:job.invitationUrl,expires_at:new Date(job.expiresAt).toISOString()}});
  update={state:'accepted',invitationUrl:null,lastError:null,acceptedAt:now};
 }catch(e){
  const failure=e instanceof NotificationPlatformError?e:new NotificationPlatformError('provider_result_unknown',true),attempts=Number(job.attempts)+1;
  update=failure.uncertain?{state:'uncertain',attempts,invitationUrl:null,lastError:failure.code}:{state:'failed',attempts,lastError:failure.code,...(failure.retryable&&attempts<5?{nextAttemptAt:now+30_000*attempts}:{invitationUrl:null,nextAttemptAt:NEVER})};
 }
 await db.runTransaction(async tx=>{if((await tx.get(ref)).data()?.lease!==lease)return;tx.update(ref,{...update,lease:null,updatedAt:Date.now()});});
 return String(update.state);
}
export async function runDiscountInvitationOutbox(db:Firestore,now=Date.now(),deadline=Date.now()+20_000){
 const counts:Record<string,number>={},jobs=await db.collection(INVITATIONS.outbox).where('nextAttemptAt','<=',now).orderBy('nextAttemptAt').limit(20).get();
 for(const doc of jobs.docs){if(Date.now()>deadline)break;const state=await deliverDiscountInvitation(db,doc.id,now);if(state)counts[state]=(counts[state]||0)+1;}
 return counts;
}
