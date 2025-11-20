

import { SubscriptionsClientPage } from './client-page';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';
import { getSubscriptionPlans } from './actions';


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
