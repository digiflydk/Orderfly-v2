import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { marketingConfig } from '@/lib/marketing/config';
import { MarketingError, Omnisend } from '@/lib/marketing/provider';
import type { ConsentEvent } from '@/lib/marketing/consent';
import { NotificationPlatformClient, NotificationPlatformError } from '@/lib/notifications/platform';
import { gameMailConfig } from './mail-config';
import { scratchCardDraftSchema, redemptionText } from './scratch-card';

const NEVER=Number.MAX_SAFE_INTEGER;
export async function runGameOutbox(db:Firestore, now=Date.now(), providerFactory=(config:NonNullable<ReturnType<typeof marketingConfig>>)=>new Omnisend(config)){
  const counts={accepted:0,synced:0,failed:0,uncertain:0};
  for(const collection of ['gameMailOutbox','gameConsentOutbox'] as const){
    const jobs=await db.collection(collection).where('nextAttemptAt','<=',now).orderBy('nextAttemptAt').limit(10).get();
    for(const doc of jobs.docs){
      const lease=randomUUID();
      const job=await db.runTransaction(async tx=>{
        const snap=await tx.get(doc.ref), data=snap.data();
        if(!data||!['pending','failed'].includes(data.state)||data.nextAttemptAt>now)return null;
        tx.update(doc.ref,{state:'dispatching',lease,updatedAt:now,nextAttemptAt:NEVER});
        return data;
      });
      if(!job)continue;
      let state:'accepted'|'synced'|'failed'|'uncertain'='uncertain',error='',retryAt=NEVER;
      try{
        const play=(await db.collection('gamePlays').doc(job.playId).get()).data();
        if(!play||play.brandId!==job.brandId||play.email!==job.email||collection==='gameConsentOutbox'&&!play.newsletter)throw new MarketingError('game_scope_mismatch',false);
        if(collection==='gameMailOutbox'){
          const voucherId=job.voucherId||createHash('sha256').update(`${job.brandId}\n${job.code}`).digest('hex');
          const voucher=(await db.collection('gameVouchers').doc(voucherId).get()).data();
          if(!voucher||voucher.playId!==job.playId||voucher.code!==job.code)throw new MarketingError('voucher_scope_mismatch',false);
          const mail=gameMailConfig(job.brandId),brand=(await db.collection('brands').doc(job.brandId).get()).data();
          const game=scratchCardDraftSchema.safeParse((await db.collection('gameScratchDrafts').doc(job.brandId).get()).data());
          if(!mail||!brand||!game.success)throw new MarketingError('game_mail_configuration_required',false);
          await new NotificationPlatformClient().send({idempotencyKey:`game-prize-${job.playId}`,templateKey:'orderfly.games.prize',organizationId:mail.organizationId,senderProfile:mail.senderProfile,locale:'da',recipientEmail:job.email,recipientName:job.name,relatedEntity:{type:'game_play',id:job.playId},variables:{brand_id:job.brandId,brand_name:String(brand.name||''),logo_url:game.data.logoUrl||String(brand.logoUrl||''),primary_color:game.data.primaryColor,surface_color:game.data.surfaceColor,subject:game.data.emailSubject,message:game.data.emailMessage,name:job.name,prize:job.prizeName,code:job.code,redemption:Array.isArray(job.redemptionChannels)?redemptionText(job.redemptionChannels):job.redemption,mode:job.mode}});
          state='accepted';
        }else{
          const config=marketingConfig(job.brandId);
          if(!config)throw new MarketingError('configuration_required',false);
          const provider=providerFactory(config);
          await provider.verifyBrand();
          const event:ConsentEvent={id:job.playId,brandId:job.brandId,customerId:job.playId,locationId:'game',email:job.email,channel:'email',source:'game',capturedAt:job.capturedAt,version:job.version,wording:job.wording};
          const result=await provider.sync(event);
          state=result==='synced'?'synced':'accepted';
        }
      }catch(err){
        error=err instanceof MarketingError||err instanceof NotificationPlatformError?err.code:'provider_result_unknown';
        // Once dispatch begins, an unknown result must not trigger a second voucher email.
        if(err instanceof NotificationPlatformError){state=err.uncertain?'uncertain':'failed';if(err.retryable&&(job.attempts||0)<5)retryAt=now+Math.min(3600000,30000*2**(job.attempts||0));}
        else if(err instanceof MarketingError){state=err.uncertain?'uncertain':'failed';if(err.retryable&&!err.uncertain&&(job.attempts||0)<5)retryAt=now+Math.min(3600000,30000*2**(job.attempts||0));}
      }
      await db.runTransaction(async tx=>{
        const snap=await tx.get(doc.ref);
        if(snap.data()?.lease!==lease)return;
        tx.update(doc.ref,{state,lease:null,lastError:error||null,attempts:(snap.data()?.attempts||0)+1,updatedAt:Date.now(),nextAttemptAt:retryAt});
      });
      counts[state]++;
    }
  }
  return counts;
}
