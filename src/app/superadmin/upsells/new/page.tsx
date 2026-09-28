

import { getBrands } from '@/app/superadmin/brands/actions';
import { upsellClientData } from '@/lib/upsell-serialization';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { UpsellFormPage } from '@/components/superadmin/upsell-form-page';
import { getCategoriesForBrand, getProductsForBrand } from '@/app/superadmin/upsells/actions';
import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

export default async function NewUpsellPage() {
	const result = await loadSuperadminPage('orderfly.catalog:view', () => Promise.all([
		getBrands(),
		getAllLocations(),
		// We can pass empty arrays initially, as they will be fetched on brand selection in the client
		Promise.resolve([]),
		Promise.resolve([]),
	]));
	if (!result) return <AccessDeniedPage />;
	const [brands, locations, products, categories] = result;

	return (
		<UpsellFormPage
			brands={upsellClientData(brands)}
			locations={upsellClientData(locations)}
			products={products}
			categories={categories}
		/>
	);
}


