import {validateDeliveryPricingRules,type DeliveryPricingRules} from './calculate';
/** Display only. No supplier availability, subsidy approval or payment authority. */
export function deliveryTariffPreview(r:DeliveryPricingRules,meters:number){
 if(!validateDeliveryPricingRules(r)||!Number.isSafeInteger(meters)||meters<0||meters>r.maxDistanceMeters)return null;
 const band=r.tariff.kind==='bands'?r.tariff.bands.find((b,i,a)=>meters>=b.fromMeters&&(meters<b.toMeters||i===a.length-1&&meters===b.toMeters)):null;
 const fee=r.tariff.kind==='kilometer'?Number(BigInt(r.tariff.baseMinor)+(BigInt(Math.max(0,meters-r.tariff.includedMeters))*BigInt(r.tariff.perKmMinor)+500n)/1000n):band?.feeMinor;
 if(fee===undefined||!Number.isSafeInteger(fee)||fee>r.maximumCustomerFeeMinor)return null;
 return {baseFeeMinor:fee,currency:r.currency,minimumMinor:Math.max(r.minimumMinor,band?.minimumMinor??0),freeMinimumMinor:r.freeDelivery&&meters<=r.freeDelivery.maxDistanceMeters?r.freeDelivery.minimumMinor:null};
}
