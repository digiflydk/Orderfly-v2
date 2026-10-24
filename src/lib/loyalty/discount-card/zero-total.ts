import { z } from 'zod';
import { discountCardAmountOre } from './rules';
const id=z.string().min(1).max(200).refine(value=>!value.includes('/'));
const amount=z.number().int().positive().safe();
const freeCardOrder=z.object({
  brandId:id,locationId:id,totalAmount:z.literal(0),paymentMethod:z.literal('Stripe'),
  customerDetails:z.object({id}),
  discountCard:z.object({brandId:id,locationId:id,customerId:id,memberId:id,assignmentId:id,groupId:id,
    groupName:z.string().min(1),percentage:z.number().positive().max(100).multipleOf(0.01),featureVersion:z.number().int().positive(),
    groupVersion:z.number().int().positive(),assignmentVersion:z.number().int().positive(),
    eligibleSubtotalOre:amount,amountOre:amount,purchaseStampsEligible:z.literal(false)}),
  paymentDetails:z.object({subtotal:z.number().finite().positive(),itemDiscountTotal:z.literal(0),
    cartDiscountTotal:z.number().finite().positive(),discountTotal:z.number().finite().positive(),
    deliveryFee:z.literal(0),bagFee:z.literal(0),adminFee:z.literal(0)}),
});
/** Only a completed, genuinely zero-total provider session may use this path. */
export function isCompletedFreeCardSession(session:{mode?:unknown;status?:unknown;payment_status?:unknown;amount_total?:unknown;currency?:unknown}) {
  return session.mode==='payment'&&session.status==='complete'&&session.payment_status==='no_payment_required'&&session.amount_total===0&&session.currency==='dkk';
}
/** Server-persisted snapshot proves full merchandise was discounted, with no
 * residual fees or unrelated voucher. Never accepts browser-supplied orders. */
export function isZeroTotalDiscountCardOrder(value:unknown):boolean {
  const parsed=freeCardOrder.safeParse(value);if(!parsed.success)return false;
  const order=parsed.data,card=order.discountCard,payment=order.paymentDetails;
  return card.brandId===order.brandId&&card.locationId===order.locationId&&card.customerId===order.customerDetails.id&&
    card.amountOre===card.eligibleSubtotalOre&&discountCardAmountOre(card.eligibleSubtotalOre,card.percentage)===card.amountOre&&Math.round(payment.subtotal*100)===card.amountOre&&
    Math.round(payment.cartDiscountTotal*100)===card.amountOre&&Math.round(payment.discountTotal*100)===card.amountOre;
}
