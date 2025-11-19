
import { getUsers } from './actions';
import { UsersClientPage } from './client-page';
import { getRoles } from '../roles/actions';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

async function UsersPageContent() {
  const [users, roles] = await Promise.all([
    getUsers(),
    getRoles()
  ]);

  const usersWithRoles = users.map(user => {
    const userRoles = (user.roleIds || []).map(roleId => roles.find(r => r.id === roleId)?.name).filter(Boolean);
    return { ...user, roles: userRoles as string[] };
  });

  return (
    <UsersClientPage initialUsers={usersWithRoles} allRoles={roles} />
  );
}

export default function UsersPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <UsersPageContent />;
}
