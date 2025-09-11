
import { notFound } from 'next/navigation';
import { getRoleById } from '@/app/superadmin/roles/actions';
import { RoleFormPage } from '@/components/superadmin/role-form-page';

export default async function EditRolePage({ params }: { params: { roleId: string } }) {
    const role = await getRoleById(params.roleId);

    if (!role) {
        notFound();
    }

    return (
        <RoleFormPage role={role} />
    );
}
