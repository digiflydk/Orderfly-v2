
import { notFound } from 'next/navigation';
import { getToppingGroupById, getToppings, getToppingUsage } from '@/app/superadmin/toppings/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { ToppingGroupFormPage } from '@/components/superadmin/topping-group-form-page';

export default async function EditToppingGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
    const { groupId } = await params;
    
    if (!groupId) {
        notFound();
    }

    const [group, locations, brands, toppings, usage] = await Promise.all([
        getToppingGroupById(groupId),
        getAllLocations(),
        getBrands(),
        getToppings(),
        getToppingUsage()
    ]);

    if (!group) {
        notFound();
    }

    return (
        <ToppingGroupFormPage group={group} locations={locations} brands={brands} toppings={toppings.filter(t => t.groupId === group.id)} usage={usage[group.id]} />
    );
}
