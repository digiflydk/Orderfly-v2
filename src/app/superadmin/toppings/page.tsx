
import { ToppingsClientPage } from './toppings-client-page';
import { getToppingGroups, getToppings } from './actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';


export default async function ToppingsPage() {
    // Fetch all data on the server to ensure stability
    const toppingGroups = await getToppingGroups();
    const toppings = await getToppings();
    const locations = await getAllLocations();
    const brands = await getBrands();

    return (
        <ToppingsClientPage 
            initialToppingGroups={toppingGroups}
            initialToppings={toppings}
            initialLocations={locations}
            initialBrands={brands}
        />
    );
}
