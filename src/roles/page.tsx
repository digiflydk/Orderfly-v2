

import { getRoles } from './actions';
import { RolesClientPage } from './client-page';

export default async function RolesPage() {
  const roles = await getRoles();

  return (
    <RolesClientPage initialRoles={roles} />
  );
}
