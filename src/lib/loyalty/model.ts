import { z } from 'zod';
import type { LoyaltySettings } from '@/types';

const requiredNumber = z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number().finite());
const percent = requiredNumber.pipe(z.number().min(0).max(100));
const band = z.object({ points: percent, value: requiredNumber.pipe(z.number().min(0)) });
const bands = z.array(band).min(1).refine(a => a.every((v,i) => i === 0 || v.value > a[i-1].value), 'Thresholds must increase');
const range = z.object({ min:percent.pipe(z.number().int()), max:percent.pipe(z.number().int()) }).refine(r => r.min <= r.max);
export const scoreSettingsSchema = z.object({
  weights: z.object({totalOrders:percent,averageOrderValue:percent,recency:percent,frequency:percent,deliveryMethodBonus:percent})
    .refine(w => Math.abs(Object.values(w).reduce((a,b)=>a+b,0)-100)<0.000001,'Weights must total 100'),
  thresholds:z.object({totalOrders:bands,averageOrderValue:bands,recency:bands,frequency:bands}),
  deliveryMethodBonus:percent,
  classifications:z.object({loyal:range,occasional:range,atRisk:range}).refine(c => c.atRisk.min===0 && c.loyal.max===100 && c.atRisk.max+1===c.occasional.min && c.occasional.max+1===c.loyal.min,'Ranges must cover 0–100 without gaps or overlaps'),
});
export function asDate(value:any):Date|null {
  try {
    const d=typeof value?.toDate==='function' ? value.toDate()
      : value instanceof Date ? value
      : typeof value?.seconds==='number' ? new Date(value.seconds*1000)
      : value!=null && value!=='' ? new Date(value) : null;
    return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
  } catch { return null; }
}
type ScoreOrder = {paymentStatus?:unknown;status?:unknown;totalAmount?:unknown;refundedAmountOre?:unknown;paidAt?:unknown;createdAt?:unknown;deliveryType?:unknown};
function netOrderOre(order:ScoreOrder):number {
  if(order.paymentStatus!=='Paid'||order.status==='Canceled')return 0;
  if(typeof order.totalAmount!=='number'||!Number.isFinite(order.totalAmount)||order.totalAmount<0)return 0;
  const gross=Math.round(order.totalAmount*100),refund=order.refundedAmountOre??0;
  if(!Number.isSafeInteger(gross)||!Number.isSafeInteger(refund)||(refund as number)<0)return 0;
  return Math.max(0,gross-(refund as number));
}
export function qualifyingOrders<T extends ScoreOrder>(orders:T[]):T[] {
  return orders.filter(order=>netOrderOre(order)>0);
}
export function customerMetrics(orders:ScoreOrder[],settings:LoyaltySettings,now=new Date()) {
  const paid=qualifyingOrders(orders);
  const dates=paid.map(o=>asDate(o.paidAt)||asDate(o.createdAt)).filter((d):d is Date=>!!d).sort((a,b)=>a.getTime()-b.getTime());
  const totalOrders=paid.length,totalSpend=paid.reduce((sum,o)=>sum+netOrderOre(o),0)/100;
  const lastOrderDate=dates.at(-1),days=lastOrderDate?Math.max(0,(now.getTime()-lastOrderDate.getTime())/86400000):Infinity;
  const scoreFor=(value:number,list:{value:number;points:number}[])=>[...list].sort((a,b)=>b.value-a.value).find(t=>value>=t.value)?.points??0;
  const frequency=dates.length>1?(dates.at(-1)!.getTime()-dates[0].getTime())/86400000/(dates.length-1):Infinity;
  const factors={totalOrders:scoreFor(totalOrders,settings.thresholds.totalOrders),averageOrderValue:scoreFor(totalOrders?totalSpend/totalOrders:0,settings.thresholds.averageOrderValue),recency:Number.isFinite(days)?scoreFor(days,settings.thresholds.recency):0,frequency:Number.isFinite(frequency)?scoreFor(frequency,settings.thresholds.frequency):0,
    deliveryMethodBonus:paid.length>1 && ['Delivery','Pickup'].includes(String(paid[0].deliveryType)) && paid.every(o=>o.deliveryType===paid[0].deliveryType)?settings.deliveryMethodBonus:0};
  const loyaltyScore=totalOrders?Math.max(0,Math.min(100,Math.round(Object.entries(factors).reduce((sum,[k,v])=>sum+v*settings.weights[k as keyof typeof factors]/100,0)))):0;
  const c=settings.classifications;
  const loyaltyClassification=!totalOrders?'New':loyaltyScore>=c.loyal.min?'Loyal':loyaltyScore>=c.occasional.min?'Occasional':'At Risk';
  return {totalOrders,totalSpend,lastOrderDate,loyaltyScore,loyaltyClassification};
}
