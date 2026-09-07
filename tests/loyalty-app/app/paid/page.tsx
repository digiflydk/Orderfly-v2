import {getAdminDb} from '../../fixtures/admin';
import {fulfillPaidSession} from '@/lib/payments/settlement';
import {LoyaltyAccount} from '@/components/loyalty/account';
export default async function Paid({searchParams}:{searchParams:Promise<{order:string}>}){
 const {order}=await searchParams;
 const session=(await getAdminDb().doc('qa_sessions/'+order).get()).data();
 if(!session)throw Error('Local session missing');
 await fulfillPaidSession(session as any);
 const receipt=(await getAdminDb().doc('orders/'+order).get()).data()!;
 return <><h1>Betaling registreret</h1><p>Betalt: {receipt.totalAmount} kr.</p><p>Optjent: {receipt.loyalty?.earnedOre/100} kr.</p><p>Indløst: {receipt.loyalty?.redeemedOre/100} kr.</p><LoyaltyAccount brandId="b"/><a href="/">Næste køb</a></>;
}
