'use server';
import { revalidatePath } from 'next/cache';
import { getAdminDb, admin } from '@/lib/firebase-admin';
import { orderflyReadGrants, verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { principalKey } from '@/lib/access/authority';
import { scratchCardDraftSchema, type ScratchCardDraft } from '@/lib/games/scratch-card';

export async function gameBrands(): Promise<Array<{id:string; name:string; slug:string; logoUrl:string}>> {
  const grants = await orderflyReadGrants('orderfly.website:view');
  const db = getAdminDb();
  const rows = await Promise.all(grants.filter(g => g.locationIds === null).map(async grant => {
    const doc = await db.collection('brands').doc(grant.brandId).get();
    return doc.exists ? {id:doc.id, name:String(doc.data()?.name || doc.id),slug:String(doc.data()?.slug || ''),logoUrl:String(doc.data()?.logoUrl || '')} : null;
  }));
  return rows.filter((row): row is {id:string;name:string;slug:string;logoUrl:string} => row !== null).sort((a,b)=>a.name.localeCompare(b.name,'da'));
}

export async function getScratchCardDraft(brandId: string): Promise<ScratchCardDraft | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)) return null;
  const grants = await orderflyReadGrants('orderfly.website:view');
  if (!grants.some(g => g.brandId === brandId && g.locationIds === null)) return null;
  const doc = await getAdminDb().collection('gameScratchDrafts').doc(brandId).get();
  if (!doc.exists) return null;
  const parsed = scratchCardDraftSchema.safeParse(doc.data());
  return parsed.success ? parsed.data : null;
}

export async function saveScratchCardDraft(form: FormData): Promise<{ok:boolean;message:string}> {
  let prizes: unknown;
  try { prizes=JSON.parse(String(form.get('prizes') || '[]')); }
  catch { return {ok:false,message:'Præmierne kunne ikke læses.'}; }
  const parsed = scratchCardDraftSchema.safeParse({
    brandId: form.get('brandId'), title: form.get('title'),
    instruction: form.get('instruction'), revealText: form.get('revealText'),
    logoUrl: form.get('logoUrl'), backgroundUrl: form.get('backgroundUrl'), fontUrl: form.get('fontUrl'), primaryColor: form.get('primaryColor'), surfaceColor: form.get('surfaceColor'), collectPhone: form.get('collectPhone') === 'on', newsletterText: form.get('newsletterText'),
    cardsPerPlay:Number(form.get('cardsPerPlay')),
    totalCardLimit:Number(form.get('totalCardLimit')),
    prizes,
    placement: form.get('placement'),
    paths: String(form.get('paths') || '').split(/\r?\n/).map(p=>p.trim()).filter(Boolean),
  });
  if (!parsed.success) return {ok:false,message:parsed.error.issues.map(i=>i.message).join(' ')};
  const input = parsed.data;
  try {
    const identity = await verifiedOrderflyIdentity();
    const db = getAdminDb(), ref = db.collection('gameScratchDrafts').doc(input.brandId);
    await db.runTransaction(async tx => {
      const before = await tx.get(ref);
      await authorizeTransaction(tx, identity, {brandId:input.brandId}, `orderfly.website:${before.exists ? 'edit' : 'create'}`, 'company');
      if ((before.data()?.playedCount||0)>0 && JSON.stringify(before.data()?.prizes)!==JSON.stringify(input.prizes)) throw new Error('Præmier kan ikke ændres efter første spil.');
      tx.set(ref, { ...input, status:before.data()?.status||'draft', playedCount:before.data()?.playedCount||0, winnerCounts:before.data()?.winnerCounts||input.prizes.map(()=>0), updatedAt:admin.firestore.FieldValue.serverTimestamp() });
      tx.set(db.collection('auditLogs').doc(), {
        module:'games', entity:'scratch-card', entityId:input.brandId,
        action:before.exists ? 'update' : 'create', brandId:input.brandId,
        actorId:principalKey(identity), path:ref.path,
        timestamp:admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    revalidatePath('/superadmin/games/scratch-card');
    return {ok:true,message:'Opsætningen er gemt.'};
  } catch {
    return {ok:false,message:'Udkastet kunne ikke gemmes. Kontrollér dine rettigheder og prøv igen.'};
  }
}

export async function uploadGameAsset(form:FormData):Promise<{ok:boolean;url?:string;message:string}> {
  const brandId=String(form.get('brandId')||''),kind=String(form.get('kind')||''),file=form.get('file');
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)||!['logo','background','font','prize'].includes(kind)||!(file instanceof File)||file.size<1||file.size>5_000_000)
    return {ok:false,message:'Vælg en fil på højst 5 MB.'};
  try{
    await (await import('@/lib/access/orderfly-session')).requireOrderflyAccess(brandId,null,'orderfly.website:edit');
    const bytes=Buffer.from(await file.arrayBuffer());
    let mime:string,extension:string;
    if(kind==='font'){
      if(file.type!=='font/woff2' && file.type!=='application/font-woff2')throw new Error('Kun WOFF2 skrifttyper understøttes.');
      if(bytes.toString('ascii',0,4)!=='wOF2')throw new Error('Ugyldig skrifttype.');
      mime='font/woff2';extension='woff2';
    }else{
      const sharp=(await import('sharp')).default;
      const image=sharp(bytes,{limitInputPixels:20_000_000,failOn:'error'}),metadata=await image.metadata();
      if(!['jpeg','png','webp'].includes(metadata.format||'')||(metadata.pages||1)>1)throw new Error('Kun JPEG, PNG og WebP billeder understøttes.');
      await image.stats();extension=metadata.format==='jpeg'?'jpg':metadata.format!;mime=`image/${metadata.format}`;
    }
    const {getStorage}=await import('firebase-admin/storage'),{getAdminApp}=await import('@/lib/firebase-admin'),{randomUUID}=await import('node:crypto');
    const app=getAdminApp(),bucketName=process.env.FIREBASE_STORAGE_BUCKET||process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if(!bucketName)throw new Error('Lagring er ikke konfigureret.');
    const bucket=getStorage(app).bucket(bucketName),object=bucket.file(`brands/${brandId}/games/${kind}/${randomUUID()}.${extension}`),token=randomUUID();
    await object.save(bytes,{resumable:false,metadata:{contentType:mime,cacheControl:'public,max-age=31536000,immutable',metadata:{firebaseStorageDownloadTokens:token}},preconditionOpts:{ifGenerationMatch:0}});
    return {ok:true,url:`https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(object.name)}?alt=media&token=${token}`,message:'Fil uploadet. Gem udkastet for at bruge den.'};
  }catch{return {ok:false,message:'Filen kunne ikke uploades. Kontrollér format og rettigheder.'};}
}

export async function importGameCodes(brandId:string,prizeIndex:number,text:string):Promise<{ok:boolean;message:string}> {
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)||!Number.isInteger(prizeIndex)||text.length>100000)return {ok:false,message:'Ugyldig kodefil.'};
  const codes=text.split(/[\r\n,;]+/).map(c=>c.trim().toUpperCase()).filter(Boolean);
  if(!codes.length||codes.length>200||new Set(codes).size!==codes.length||codes.some(c=>! /^[A-Z0-9_-]{5,40}$/.test(c)))return {ok:false,message:'Upload 1–200 unikke koder på 5–40 tegn (A–Z, 0–9, - eller _).'};
  try{
    await (await import('@/lib/access/orderfly-session')).requireOrderflyAccess(brandId,null,'orderfly.website:edit');
    const {createHash}=await import('node:crypto'),db=getAdminDb(),ref=db.collection('gameScratchDrafts').doc(brandId);
    await db.runTransaction(async tx=>{
      const game=await tx.get(ref),parsed=scratchCardDraftSchema.safeParse(game.data());
      if(!parsed.success||!parsed.data.prizes[prizeIndex]||parsed.data.prizes[prizeIndex].codeMode!=='uploaded')throw new Error('Præmien bruger ikke uploadede koder.');
      const ids=codes.map(code=>createHash('sha256').update(`${brandId}\n${code}`).digest('hex'));
      const references=ids.map(id=>ref.collection('codes').doc(id));
      const existing=await Promise.all(references.map(row=>tx.get(row)));
      const vouchers=await Promise.all(ids.map(id=>tx.get(db.collection('gameVouchers').doc(id))));
      if(existing.some(s=>s.exists)||vouchers.some(s=>s.exists))throw new Error('En kode findes allerede.');
      references.forEach((row,i)=>tx.create(row,{brandId,prizeIndex,code:codes[i],available:true,createdAt:admin.firestore.FieldValue.serverTimestamp()}));
    });
    return {ok:true,message:`${codes.length} koder importeret til præmien.`};
  }catch{return {ok:false,message:'Koderne kunne ikke importeres. Kontrollér præmieindstilling og dubletter.'};}
}

export async function setScratchCardStatus(brandId:string,status:'draft'|'test'|'live'):Promise<{ok:boolean;message:string}> {
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(brandId))return {ok:false,message:'Ugyldigt brand.'};
  try{
    const identity=await verifiedOrderflyIdentity(),db=getAdminDb(),ref=db.collection('gameScratchDrafts').doc(brandId);
    await db.runTransaction(async tx=>{
      const before=await tx.get(ref);
      await authorizeTransaction(tx,identity,{brandId},'orderfly.website:edit','company');
      const parsed=scratchCardDraftSchema.safeParse(before.data());
      if(!parsed.success)throw new Error('Gem spillet først.');
      if(status==='live'&&(!process.env.ORDERFLY_GAMES_EMAIL_ENABLED_BRANDS?.split(',').includes(brandId)))throw new Error('Mail mangler.');
      tx.update(ref,{status,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
      tx.create(db.collection('auditLogs').doc(),{module:'games',entity:'scratch-card',entityId:brandId,action:`status-${status}`,brandId,actorId:principalKey(identity),timestamp:admin.firestore.FieldValue.serverTimestamp()});
    });
    revalidatePath('/superadmin/games/scratch-card');
    return {ok:true,message:status==='live'?'Spillet er aktiveret.':'Status ændret.'};
  }catch{return {ok:false,message:'Status kunne ikke ændres. Kontrollér opsætning og adgang.'};}
}

export async function redeemGameVoucher(brandId:string,code:string):Promise<{ok:boolean;message:string}> {
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)||! /^[A-Z0-9_-]{5,40}$/.test(code))return {ok:false,message:'Ugyldig kode.'};
  try{
    const identity=await verifiedOrderflyIdentity(),db=getAdminDb(),{createHash}=await import('node:crypto');
    const id=createHash('sha256').update(`${brandId}\n${code}`).digest('hex'),ref=db.collection('gameVouchers').doc(id);
    await db.runTransaction(async tx=>{
      const voucher=await tx.get(ref);
      await authorizeTransaction(tx,identity,{brandId},'orderfly.discounts:edit','company');
      const data=voucher.data();
      if(!data||data.brandId!==brandId||data.mode!=='live'||data.state!=='issued'||data.redemption==='website')throw new Error('Kode kan ikke indløses.');
      const discountRef=db.collection('discounts').doc(`game_${id}`),discount=await tx.get(discountRef);
      if(discount.exists){
        const capacityRef=db.collection('checkout_discount_capacity').doc(createHash('sha256').update(JSON.stringify([brandId,discountRef.id])).digest('hex'));
        const capacity=await tx.get(capacityRef);
        if(!discount.data()?.isActive||discount.data()?.usedCount>0||(capacity.data()?.held||0)>0||(capacity.data()?.paid||0)>0)throw new Error('Kode er brugt eller reserveret online.');
        tx.update(discountRef,{isActive:false,updatedAt:admin.firestore.FieldValue.serverTimestamp()});
      }
      tx.update(ref,{state:'redeemed',redeemedAt:admin.firestore.FieldValue.serverTimestamp(),redeemedBy:principalKey(identity)});
      tx.create(db.collection('auditLogs').doc(),{module:'games',entity:'voucher',entityId:id,action:'redeem',brandId,actorId:principalKey(identity),timestamp:admin.firestore.FieldValue.serverTimestamp()});
    });
    return {ok:true,message:'Koden er indløst og kan ikke bruges igen.'};
  }catch{return {ok:false,message:'Koden findes ikke, er brugt eller kan ikke indløses her.'};}
}
