
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { SubscriptionPlan } from '@/types';
import { SubscriptionsClientPage } from './client-page';


export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const q = query(collection(db, 'subscription_plans'), orderBy('priceMonthly'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SubscriptionPlan[];
}

export default async function SubscriptionsPage() {
  const plans = await getSubscriptionPlans();

  return (
    <SubscriptionsClientPage initialPlans={plans} />
  );
}
