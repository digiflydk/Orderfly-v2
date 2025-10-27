
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";
import { notFound } from 'next/navigation';
import { getCategoryById, getCategories } from '@/app/superadmin/categories/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { CategoryFormPage } from '@/components/superadmin/category-form-page';

export default async function EditCategoryPage({ params }: AsyncPageProps<{ categoryId: string }>) {
    const { categoryId } = await resolveParams(params);
    
    if (!categoryId) {
        notFound();
    }

    const [category, locations, brands] = await Promise.all([
        getCategoryById(categoryId),
        getAllLocations(),
        getBrands()
    ]);

    if (!category) {
        notFound();
    }

    return (
        <CategoryFormPage
            category={category}
            locations={locations}
            brands={brands}
        />
    );
}
