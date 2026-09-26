import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { getAdminDb, admin } from '@/lib/firebase-admin';
import { scratchCardDraftSchema, scratchCardOnPage } from './scratch-card';
import { drawNoWinBoard, drawWinBoard } from './scratch-card-preview';
import { marketingConfig } from '@/lib/marketing/config';
import { requireOrderflyAccess } from '@/lib/access/orderfly-session';

const hash = (value:string) => createHash('sha256').update(value).digest('hex');
const randomCode = () => `ES-${randomBytes(9).toString('hex').toUpperCase()}`;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export type PlayInput = {brandId:string;name:string;email:string;phone?:string;newsletter:boolean;pathname:string;test?:boolean};
export class GameError extends Error { constructor(public status:number, message:string){super(message);} }

export async function playScratchCard(input:PlayInput, ip:string) {
  const email=input.email.trim().toLowerCase(), name=input.name.trim(), phone=input.phone?.trim()||'';
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(input.brandId)||name.length<2||name.length>100||!emailPattern.test(email)||email.length>254||phone.length>30||!/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(input.pathname))
    throw new GameError(400,'Kontrollér navn, e-mail og sideadresse.');
  const db=getAdminDb(), gameRef=db.collection('gameScratchDrafts').doc(input.brandId), gameDoc=await gameRef.get();
  const parsed=scratchCardDraftSchema.safeParse(gameDoc.data());
  if(!parsed.success||parsed.data.brandId!==input.brandId)throw new GameError(404,'Spillet findes ikke.');
  const game=parsed.data, status=gameDoc.data()?.status;
  if(input.test){
    await requireOrderflyAccess(input.brandId,null,'orderfly.website:view');
    if(status!=='test'&&status!=='draft')throw new GameError(403,'Testspillet er ikke aktivt.');
  }else if(status!=='live'||!(input.pathname==='/games'||scratchCardOnPage(game,input.pathname)))throw new GameError(404,'Spillet er ikke aktivt på denne side.');
  const mailReady=!!marketingConfig(input.brandId) && String(process.env.ORDERFLY_GAMES_EMAIL_ENABLED_BRANDS||'').split(',').includes(input.brandId);
  if(!input.test&&!mailReady)throw new GameError(503,'E-mail er ikke konfigureret for dette brand.');
  const day=new Date().toISOString().slice(0,10), ipKey=hash(`${input.brandId}\n${day}\n${ip}`);
  const leadKey=hash(`${input.brandId}\n${input.test?'test':'live'}\n${email}`);
  const playRef=db.collection('gamePlays').doc(leadKey), limiterRef=db.collection('gamePlayLimits').doc(ipKey);
  const code=randomCode(), codeId=hash(`${input.brandId}\n${code}`), voucherRef=db.collection('gameVouchers').doc(codeId);
  const roll=randomBytes(6).readUIntBE(0,6)/2**48;
  const locations=await db.collection('locations').where('brandId','==',input.brandId).get();
  const locationIds=locations.docs.filter(row=>row.data().isActive!==false).map(row=>row.id);
  if(!locationIds.length)throw new GameError(503,'Brandet har ingen aktive restauranter.');
  const result=await db.runTransaction(async tx=>{
    const [current,prior,limit]=await Promise.all([tx.get(gameRef),tx.get(playRef),tx.get(limiterRef)]);
    if(prior.exists)throw new GameError(409,'Denne e-mail har allerede spillet kampagnen.');
    if((limit.data()?.count||0)>=20)throw new GameError(429,'For mange forsøg. Prøv igen senere.');
    const fresh=scratchCardDraftSchema.safeParse(current.data());
    if(!fresh.success||current.data()?.status!==status || (!input.test&&!(input.pathname==='/games'||scratchCardOnPage(fresh.data,input.pathname))))throw new GameError(409,'Kampagnen blev ændret. Prøv igen.');
    const played=(input.test?current.data()?.testPlayedCount:current.data()?.playedCount)||0;
    const previousCounts=(input.test?current.data()?.testWinnerCounts:current.data()?.winnerCounts)||[];
    if(played>=game.totalCardLimit)throw new GameError(409,'Alle spil i kampagnen er brugt.');
    let index=-1, cumulative=0;
    for(let i=0;i<game.prizes.length;i++){cumulative+=game.prizes[i].probabilityPercent;if(roll*100<cumulative){index=i;break;}}
    const won=index>=0&&(previousCounts[index]||0)<game.prizes[index].maxWinners;
    const prize=won?game.prizes[index]:null;
    let actualCode=code, actualCodeId=codeId;
    let uploadedRef:FirebaseFirestore.DocumentReference|undefined;
    if(prize?.codeMode==='uploaded'&&!input.test){
      const pool=await tx.get(gameRef.collection('codes').where('prizeIndex','==',index).where('available','==',true).limit(1));
      if(pool.empty)throw new GameError(409,'Der er ingen ubrugte koder til denne præmie.');
      uploadedRef=pool.docs[0].ref;
      actualCode=String(pool.docs[0].data().code);
      actualCodeId=hash(`${input.brandId}\n${actualCode}`);
    }
    const voucher=prize?db.collection('gameVouchers').doc(actualCodeId):voucherRef;
    const discount=prize&&prize.type!=='item'&&!input.test?db.collection('discounts').doc(`game_${actualCodeId}`):null;
    if(prize){
      const [existing, duplicate]=await Promise.all([tx.get(voucher),tx.get(db.collection('discounts').where('brandId','==',input.brandId).where('code','==',actualCode).limit(1))]);
      if(existing.exists||!duplicate.empty)throw new GameError(409,'Koden er allerede i brug. Prøv igen.');
    }
    const counters=Array.from({length:game.prizes.length},(_,i)=>(previousCounts[i]||0)+(won&&i===index?1:0));
    const now=admin.firestore.FieldValue.serverTimestamp();
    tx.update(gameRef,input.test?{testPlayedCount:played+1,testWinnerCounts:counters}:{playedCount:played+1,winnerCounts:counters});
    tx.set(limiterRef,{brandId:input.brandId,day,count:(limit.data()?.count||0)+1,updatedAt:now});
    const board=won?drawWinBoard(prize!.name,game.cardsPerPlay,roll):drawNoWinBoard(game.cardsPerPlay,game.revealText);
    const newsletter=!input.test&&input.newsletter===true;
    tx.create(playRef,{brandId:input.brandId,name,email,phone,newsletter,newsletterText:newsletter?game.newsletterText:null,consentAt:newsletter?now:null,mode:input.test?'test':'live',board,prizeIndex:won?index:null,createdAt:now});
    if(prize){
      if(uploadedRef)tx.update(uploadedRef,{available:false,claimedBy:playRef.id,claimedAt:now});
      tx.create(voucher,{brandId:input.brandId,code:actualCode,playId:playRef.id,prizeName:prize.name,prizeType:prize.type,redemption:prize.redemption,mode:input.test?'test':'live',state:'issued',issuedAt:now,email});
      if(discount)tx.create(discount,{id:discount.id,brandId:input.brandId,locationIds,applicationType:'code',code:actualCode,description:`Spilgevinst: ${prize.name}`,discountType:prize.type==='percent'?'percentage':'fixed_amount',discountValue:prize.value,minOrderValue:0,isActive:true,orderTypes:['pickup','delivery'],activeDays:[],activeTimeSlots:[],usageLimit:1,usedCount:0,perCustomerLimit:1,firstTimeCustomerOnly:false,allowStacking:false,createdAt:now,updatedAt:now});
      if(mailReady)tx.create(db.collection('gameMailOutbox').doc(playRef.id),{brandId:input.brandId,playId:playRef.id,code:actualCode,prizeName:prize.name,name,email,redemption:prize.redemption,mode:input.test?'test':'live',state:'pending',attempts:0,nextAttemptAt:Date.now(),createdAt:now});
    }
    if(newsletter)tx.create(db.collection('gameConsentOutbox').doc(playRef.id),{brandId:input.brandId,playId:playRef.id,email,wording:game.newsletterText,version:'game-email-da-v1',capturedAt:Date.now(),state:'pending',attempts:0,nextAttemptAt:Date.now()});
    return {board,won,prizeName:prize?.name||null,mailQueued:!!prize&&mailReady};
  });
  return result;
}
