
import { notFound } from 'next/navigation';
import { getToppingGroupById } from '@/app/superadmin/toppings/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { ToppingGroupFormPage } from '@/components/superadmin/topping-group-form-page';

export default async function EditToppingGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
    const { groupId } = await params;
    
    if (!groupId) {
        notFound();
    }

    const [group, locations, brands] = await Promise.all([
        getToppingGroupById(groupId),
        getAllLocations(),
        getBrands()
    ]);

    if (!group) {
        notFound();
    }

    return (
        <ToppingGroupFormPage group={group} locations={locations} brands={brands} />
    );
}
