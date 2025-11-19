

import type { Product, Brand, Category } from '@/types';
import { getProducts } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getCategories } from '@/app/superadmin/categories/actions';
import { ProductsClientPage } from './client-page';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

async function ProductsPageContent() {
    const [products, brands, categories] = await Promise.all([
        getProducts(),
        getBrands(),
        getCategories(),
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));
    const categoryMap = new Map(categories.map(c => [c.id, c.categoryName]));

    const productsWithDetails = products.map(product => ({
        ...product,
        brandName: brandMap.get(product.brandId) || 'Unknown Brand',
        categoryName: categoryMap.get(product.categoryId) || 'Uncategorized',
    }));

    return (
        <ProductsClientPage
            initialProducts={productsWithDetails}
            brands={brands}
        />
    );
}

export default function ProductsPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <ProductsPageContent />;
}
