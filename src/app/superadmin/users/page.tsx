
import { getUsers } from './actions';
import type { Role } from '@/types';
import { UsersClientPage } from './client-page';
import { getRoles } from '../roles/actions';

export default async function UsersPage() {
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
