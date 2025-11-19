
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { SubscriptionPlan } from '@/types';
import { SubscriptionsClientPage } from './client-page';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';


export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const q = query(collection(db, 'subscription_plans'), orderBy('priceMonthly'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SubscriptionPlan[];
}

async function SubscriptionsPageContent() {
  const plans = await getSubscriptionPlans();

  return (
    <SubscriptionsClientPage initialPlans={plans} />
  );
}

export default function SubscriptionsPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <SubscriptionsPageContent />;
}
