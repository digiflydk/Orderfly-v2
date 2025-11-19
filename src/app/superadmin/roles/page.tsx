

import { getRoles } from './actions';
import { RolesClientPage } from './client-page';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

async function RolesPageContent() {
  const roles = await getRoles();

  return (
    <RolesClientPage initialRoles={roles} />
  );
}

export default function RolesPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <RolesPageContent />;
}
