import 'server-only';
import { createHash } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireOrderflyAccess } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { managedDeliveryBindingSchema, verifiedDeliveryEventSchema } from '../provider-contract';
import { bookingIntentSchema } from '../booking/state';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const querySchema = z.object({ brandId: id, locationId: id, orderId: id.optional(), cursor: z.string().max(2048).optional(), eventCursor: z.string().max(2048).optional() }).strict()
  .refine(q => q.orderId ? !q.cursor : !q.eventCursor);
const PAGE = 25;
const statuses = ['booked', 'courier_assigned', 'courier_to_pickup', 'picked_up', 'delivered', 'cancelled', 'failed'];
export class DeliveryQueryError extends Error { constructor(public code = 'delivery_query_invalid', public status = 400) { super(code); } }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const encode = (scope: string, after: string) => Buffer.from(JSON.stringify({scope,after})).toString('base64url');
function decode(raw: string | undefined, scope: string): string | null {
  if (!raw) return null;
  try { const value=z.object({scope:z.literal(scope),after:id}).strict().parse(JSON.parse(Buffer.from(raw,'base64url').toString('utf8')));return value.after; }
  catch { throw new DeliveryQueryError(); }
}
export type DeliveryOrderRow = { id: string; providerId: string; bookingState: string | null; deliveryStatus: string | null; paymentStatus: string | null; kitchenStatus: string | null; trackingUrl: null; costReviewRequired:boolean };
export async function readDeliveryOrders(raw: unknown) {
  const parsed=querySchema.safeParse(raw);if(!parsed.success)throw new DeliveryQueryError();const q=parsed.data;
  await requireOrderflyAccess(q.brandId,[q.locationId],'orderfly.orders:view');
  const db=getAdminDb(), location=(await db.collection('locations').doc(q.locationId).get()).data();
  if(!location || location.brandId!==q.brandId)throw new AuthorityError('forbidden');
  const scope=hash([q.brandId,q.locationId,q.orderId??null]);
  async function project(doc: FirebaseFirestore.DocumentSnapshot): Promise<DeliveryOrderRow | null> {
    const order=doc.data();if(!order || order.brandId!==q.brandId || order.locationId!==q.locationId || order.deliveryType!=='Delivery')return null;
    const managed=managedDeliveryBindingSchema.safeParse(order.managedDelivery);if(!managed.success)return null;
    const [attemptDoc,stateDoc]=await Promise.all([doc.ref.collection('deliveryAttempts').doc('original').get(),doc.ref.collection('deliveryState').doc('current').get()]);
    const attempt=bookingIntentSchema.safeParse(attemptDoc.data()), state=stateDoc.data();
    const boundAttempt=attempt.success && attempt.data.scope.brandId===q.brandId && attempt.data.scope.locationId===q.locationId && attempt.data.scope.orderId===doc.id && attempt.data.provider===managed.data.providerId;
    const boundState=boundAttempt && attempt.data.state==='booked' && state && state.providerDeliveryId===attempt.data.providerDeliveryId && state.brandId===q.brandId && state.locationId===q.locationId && state.orderId===doc.id && state.provider===managed.data.providerId && statuses.includes(state.status);
    return {id:doc.id,providerId:managed.data.providerId,bookingState:boundAttempt?attempt.data.state:null,deliveryStatus:boundState?state.status:null,
      paymentStatus:['Pending','Paid','Failed','Refunded'].includes(order.paymentStatus)?order.paymentStatus:null,
      kitchenStatus:['Pending','Received','In Progress','Ready','Completed','Delivered','Canceled','Error'].includes(order.status)?order.status:null,trackingUrl:null,costReviewRequired:order.deliveryCostException?.requiresReview===true};
  }
  if(q.orderId){
    const doc=await db.collection('orders').doc(q.orderId).get(),row=await project(doc);if(!row)throw new DeliveryQueryError('delivery_not_found',404);
    let query=doc.ref.collection('deliveryEvents').orderBy(FieldPath.documentId());const after=decode(q.eventCursor,scope);if(after)query=query.startAfter(after);
    const snapshot=await query.limit(PAGE+1).get(),docs=snapshot.docs.slice(0,PAGE);
    const events=docs.flatMap(d=>{const data=d.data(),event=verifiedDeliveryEventSchema.safeParse(data.event);if(!event.success || event.data.scope.brandId!==q.brandId || event.data.scope.locationId!==q.locationId || event.data.providerId!==row.providerId)return [];
      return [{id:d.id,status:event.data.status,nativeStatus:event.data.nativeStatus,occurredAt:event.data.occurredAt,receivedAt:event.data.receivedAt,
        decision:['apply','ignore','reconcile'].includes(data.decision)?data.decision:null,reason:typeof data.reason==='string'&&/^[a-z_]{1,80}$/.test(data.reason)?data.reason:null}];});
    const more=snapshot.docs.length>PAGE;
    return {orders:[row],nextCursor:null,hasMore:false,events,nextEventCursor:more?encode(scope,docs.at(-1)!.id):null,hasMoreEvents:more};
  }
  let query=db.collection('orders').where('brandId','==',q.brandId).where('locationId','==',q.locationId).orderBy(FieldPath.documentId());const after=decode(q.cursor,scope);if(after)query=query.startAfter(after);
  const snapshot=await query.limit(PAGE+1).get(),docs=snapshot.docs.slice(0,PAGE),orders=(await Promise.all(docs.map(project))).filter((v):v is DeliveryOrderRow=>v!==null),more=snapshot.docs.length>PAGE;
  return {orders,nextCursor:more?encode(scope,docs.at(-1)!.id):null,hasMore:more,events:[],nextEventCursor:null,hasMoreEvents:false};
}
