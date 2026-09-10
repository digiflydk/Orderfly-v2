

import { notFound } from 'next/navigation';
import { ProductFormPage } from '@/components/superadmin/product-form-page';
import { getProductById } from '@/app/superadmin/products/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getCategories } from '@/app/superadmin/categories/actions';
import { getToppingGroups, getToppings } from '@/app/superadmin/toppings/actions';
import { getAllergens } from '@/app/superadmin/allergens/actions';
import type { Product, Brand, Location, Category, ToppingGroup, Allergen } from '@/types';
import { upsellClientData } from '@/lib/upsell-serialization';

export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) {
    const { productId } = await params;
    
    if (!productId) {
        notFound();
    }

    const [
        product,
        brands,
        locations,
        categories,
        toppingGroups,
        toppings,
        allergens,
    ] = await Promise.all([
        getProductById(productId),
        getBrands(),
        getAllLocations(),
        getCategories(),
        getToppingGroups(),
        getToppings(),
        getAllergens(),
    ]);

    if (!product) {
        notFound();
    }

    return (
        <ProductFormPage 
            {...upsellClientData({ product, brands, locations, categories, toppingGroups, toppings, allergens })}
        />
    );
}
