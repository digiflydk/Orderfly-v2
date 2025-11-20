

import { notFound } from 'next/navigation';
import { getRoleById } from '@/app/superadmin/roles/actions';
import { RoleFormPage } from '@/components/superadmin/role-form-page';

export default async function EditRolePage({ params }: { params: Promise<{ roleId: string }> }) {
    const { roleId } = await params;
    const role = await getRoleById(roleId);

    if (!role) {
        notFound();
    }

    return (
        <RoleFormPage role={role} />
    );
}
