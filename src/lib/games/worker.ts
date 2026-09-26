import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { marketingConfig } from '@/lib/marketing/config';
import { MarketingError, Omnisend } from '@/lib/marketing/provider';
import type { ConsentEvent } from '@/lib/marketing/consent';

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
      let state:'accepted'|'synced'|'failed'|'uncertain'='uncertain',error='';
      try{
        const play=(await db.collection('gamePlays').doc(job.playId).get()).data();
        if(!play||play.brandId!==job.brandId||play.email!==job.email||collection==='gameConsentOutbox'&&!play.newsletter)throw new MarketingError('game_scope_mismatch',false);
        const config=marketingConfig(job.brandId);
        if(!config)throw new MarketingError('configuration_required',false);
        const provider=providerFactory(config);
        await provider.verifyBrand();
        if(collection==='gameMailOutbox'){
          const voucher=(await db.collection('gameVouchers').doc(createHash('sha256').update(`${job.brandId}\n${job.code}`).digest('hex')).get()).data();
          if(!voucher||voucher.playId!==job.playId||voucher.code!==job.code)throw new MarketingError('voucher_scope_mismatch',false);
          await provider.paidOrder({eventName:'orderfly scratch prize',origin:'api',contact:{email:job.email},properties:{name:job.name,prize:job.prizeName,code:job.code,redemption:job.redemption,mode:job.mode,brandId:job.brandId}});
          state='accepted';
        }else{
          const event:ConsentEvent={id:job.playId,brandId:job.brandId,customerId:job.playId,locationId:'game',email:job.email,channel:'email',source:'game',capturedAt:job.capturedAt,version:job.version,wording:job.wording};
          const result=await provider.sync(event);
          state=result==='synced'?'synced':'accepted';
        }
      }catch(err){
        error=err instanceof MarketingError?err.code:'provider_result_unknown';
        // Once dispatch begins, an unknown result must not trigger a second voucher email.
        state=err instanceof MarketingError&&!err.uncertain&&/^provider_http_4\d\d$/.test(err.code)?'failed':'uncertain';
      }
      await db.runTransaction(async tx=>{
        const snap=await tx.get(doc.ref);
        if(snap.data()?.lease!==lease)return;
        tx.update(doc.ref,{state,lease:null,lastError:error||null,attempts:(snap.data()?.attempts||0)+1,updatedAt:Date.now(),nextAttemptAt:NEVER});
      });
      counts[state]++;
    }
  }
  return counts;
}
