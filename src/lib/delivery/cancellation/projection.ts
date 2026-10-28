import { z } from 'zod';
import { deliveryCancelResultSchema } from '../provider-contract';
export type CancellationState = 'submitting'|'cancelled'|'not_cancellable'|'unknown'|'unsupported';
const savedSchema=z.object({version:z.literal(1),brandId:z.string(),locationId:z.string(),orderId:z.string(),attemptRef:z.string(),providerDeliveryId:z.string(),environment:z.enum(['sandbox','production']),state:z.enum(['submitting','cancelled','not_cancellable','unknown','unsupported']),reconcileRequired:z.boolean(),result:deliveryCancelResultSchema.nullable()});
/** Caller must authorize the order and bind the accepted booking to its immutable digest. Never projects reasons or provider identifiers. */
export function projectCancellation(raw:unknown,binding:{brandId:string;locationId:string;orderId:string;attemptRef:string;providerDeliveryId:string},deliveryStatus:string|null,kitchenStatus:unknown):CancellationState|null{
 const parsed=savedSchema.safeParse(raw);if(!parsed.success)return null;const saved=parsed.data;
 if(saved.brandId!==binding.brandId||saved.locationId!==binding.locationId||saved.orderId!==binding.orderId||saved.attemptRef!==binding.attemptRef||saved.providerDeliveryId!==binding.providerDeliveryId)return null;
 if(saved.reconcileRequired)return 'unknown';
 if(saved.state==='submitting')return saved.result===null?'submitting':'unknown';
 if(saved.result?.kind!==saved.state)return 'unknown';
 if(saved.state==='cancelled'&&(kitchenStatus==='Delivered'||deliveryStatus!==null&&['courier_to_pickup','picked_up','delivered','failed'].includes(deliveryStatus)))return 'unknown';
 return saved.state;
}
