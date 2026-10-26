import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { deliveryIdSchema, managedDeliveryBindingSchema } from '@/lib/delivery/provider-contract';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
/** Server-owned evidence, written only by the accepted verified delivery-event transaction. */
export const managedDeliveryCompletionSchema=z.object({version:z.literal(1),brandId:deliveryIdSchema,locationId:deliveryIdSchema,orderId:deliveryIdSchema,providerId:z.literal('wolt'),providerDeliveryId:z.string().min(1).max(300),attemptRef:digest,requestDigest:digest,eventRef:digest,completedAtMs:z.number().int().nonnegative().safe()}).strict();
export function verifiedManagedFeedbackCompletion(order:Record<string,any>,orderId:unknown){
 const marker=managedDeliveryCompletionSchema.safeParse(order.managedDeliveryCompletion),binding=managedDeliveryBindingSchema.safeParse(order.managedDelivery);
 if(!marker.success||!binding.success||order.deliveryType!=='Delivery')return false;
 const m=marker.data;
 return m.orderId===orderId&&m.brandId===order.brandId&&m.locationId===order.locationId&&m.providerId===binding.data.providerId&&m.requestDigest===binding.data.requestDigest&&m.attemptRef===createHash('sha256').update(JSON.stringify(['delivery-original-v1',m.brandId,m.locationId,m.orderId])).digest('hex');
}
