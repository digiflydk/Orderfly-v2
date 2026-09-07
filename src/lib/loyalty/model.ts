import { z } from 'zod';
import type { LoyaltySettings } from '@/types';

const band = z.object({ points: z.coerce.number().min(0).max(100), value: z.coerce.number().finite().min(0) });
const bands = z.array(band).min(1).refine(a => a.every((v,i) => i === 0 || v.value > a[i-1].value), 'Thresholds must increase');
const range = z.object({ min:z.coerce.number().int().min(0).max(100), max:z.coerce.number().int().min(0).max(100) }).refine(r => r.min <= r.max);
export const scoreSettingsSchema = z.object({
  weights: z.object({totalOrders:z.coerce.number().min(0).max(100),averageOrderValue:z.coerce.number().min(0).max(100),recency:z.coerce.number().min(0).max(100),frequency:z.coerce.number().min(0).max(100),deliveryMethodBonus:z.coerce.number().min(0).max(100)})
    .refine(w => Math.abs(Object.values(w).reduce((a,b)=>a+b,0)-100)<0.000001,'Weights must total 100'),
  thresholds:z.object({totalOrders:bands,averageOrderValue:bands,recency:bands,frequency:bands}),
  deliveryMethodBonus:z.coerce.number().min(0).max(100),
  classifications:z.object({loyal:range,occasional:range,atRisk:range}).refine(c => c.atRisk.min===0 && c.loyal.max===100 && c.atRisk.max+1===c.occasional.min && c.occasional.max+1===c.loyal.min,'Ranges must cover 0–100 without gaps or overlaps'),
});
export const programSchema = z.object({enabled:z.boolean(),earnPercent:z.number().min(0).max(25),minRedeemOre:z.number().int().min(1).max(100000),maxRedeemPercent:z.number().int().min(1).max(90)}).strict();
export type LoyaltyProgram = z.infer<typeof programSchema>;
export const defaultProgram:LoyaltyProgram={enabled:false,earnPercent:5,minRedeemOre:100,maxRedeemPercent:50};
export function asDate(value:any):Date|null {
  const d=value?.toDate?.() ?? (value ? new Date(value) : null);
  return d && Number.isFinite(d.getTime()) ? d : null;
}
export function ore(value:number) {
  if(!Number.isFinite(value) || value<0 || value>1000000) throw new Error('Invalid amount');
  return Math.round(value*100);
}
export function customerMetrics(orders:any[],settings:LoyaltySettings,now=new Date()) {
  const paid=orders.filter(o=>o.paymentStatus==='Paid' && o.status!=='Canceled' && Math.max(0,ore(o.totalAmount||0)-(o.refundedAmountOre||0))>0);
  const dates=paid.map(o=>asDate(o.paidAt)||asDate(o.createdAt)).filter((d):d is Date=>!!d).sort((a,b)=>a.getTime()-b.getTime());
  const totalOrders=paid.length,totalSpend=paid.reduce((sum,o)=>sum+Math.max(0,ore(o.totalAmount||0)-(o.refundedAmountOre||0)),0)/100;
  const lastOrderDate=dates.at(-1),days=lastOrderDate?Math.max(0,(now.getTime()-lastOrderDate.getTime())/86400000):Infinity;
  const scoreFor=(value:number,list:{value:number;points:number}[])=>[...list].sort((a,b)=>b.value-a.value).find(t=>value>=t.value)?.points??0;
  const frequency=dates.length>1?(dates.at(-1)!.getTime()-dates[0].getTime())/86400000/(dates.length-1):Infinity;
  const factors={totalOrders:scoreFor(totalOrders,settings.thresholds.totalOrders),averageOrderValue:scoreFor(totalOrders?totalSpend/totalOrders:0,settings.thresholds.averageOrderValue),recency:scoreFor(days,settings.thresholds.recency),frequency:Number.isFinite(frequency)?scoreFor(frequency,settings.thresholds.frequency):0,
    deliveryMethodBonus:paid.length>1 && paid.every(o=>o.deliveryType===paid[0].deliveryType)?settings.deliveryMethodBonus:0};
  const loyaltyScore=totalOrders?Math.max(0,Math.min(100,Math.round(Object.entries(factors).reduce((sum,[k,v])=>sum+v*settings.weights[k as keyof typeof factors]/100,0)))):0;
  const c=settings.classifications;
  const loyaltyClassification=!totalOrders?'New':loyaltyScore>=c.loyal.min?'Loyal':loyaltyScore>=c.occasional.min?'Occasional':'At Risk';
  return {totalOrders,totalSpend,lastOrderDate,loyaltyScore,loyaltyClassification};
}
export function rewardQuote(program:LoyaltyProgram,available:number,goodsOre:number,requested:number) {
  if(!Number.isSafeInteger(requested)||requested<0) throw new Error('Invalid redemption');
  if(!program.enabled){if(requested)throw new Error('Loyaltyprogrammet er ikke aktivt.');return {redeemOre:0,earnOre:0};}
  const cap=Math.min(Math.max(0,available),Math.floor(goodsOre*program.maxRedeemPercent/100));
  if(requested && (requested<program.minRedeemOre||requested>cap))throw new Error('Saldo eller beløbsgrænse er ændret. Opdater din saldo.');
  return {redeemOre:requested,earnOre:Math.floor((goodsOre-requested)*program.earnPercent/100)};
}
export function refundTargets(earned:number,redeemed:number,refund:number,total:number) {
  const ratio=total>0?Math.min(1,Math.max(0,refund)/total):0;
  return {reversed:Math.floor(earned*ratio),restored:Math.floor(redeemed*ratio)};
}
