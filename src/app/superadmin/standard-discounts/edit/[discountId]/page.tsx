
import { notFound } from 'next/navigation';
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";
import { getStandardDiscountById } from '@/app/superadmin/standard-discounts/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { StandardDiscountFormPage } from '@/components/superadmin/standard-discount-form-page';
import { getProducts } from '@/app/superadmin/products/actions';
import { getCategories } from '@/app/superadmin/categories/actions';

export default async function EditStandardDiscountPage({ params }: AsyncPageProps<{ discountId: string }>) {
    const { discountId } = await resolveParams(params);
    
    if (!discountId) {
        notFound();
    }
    
    const [discount, brands, locations, products, categories] = await Promise.all([
        getStandardDiscountById(discountId),
        getBrands(),
        getAllLocations(),
        getProducts(),
        getCategories(),
    ]);

    if (!discount) {
        notFound();
    }
    
    return (
        <StandardDiscountFormPage 
            key={discount.id}
            discount={discount}
            brands={brands} 
            locations={locations}
            products={products}
            categories={categories}
        />
    );
}
