

import type { Product, Brand, Category } from '@/types';
import { getProducts } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getCategories } from '@/app/superadmin/categories/actions';
import { ProductsClientPage } from './client-page';


export default async function ProductsPage() {
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
