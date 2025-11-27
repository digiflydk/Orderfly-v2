
'use server';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { BrandWebsitePageForm } from '@/components/superadmin/brand-website/pages/BrandWebsitePageForm';
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";

type PageParams = {
    brandId: string;
};

export default async function NewBrandWebsitePage({ params }: AsyncPageProps<PageParams>) {
    await requireSuperadmin();
    const { brandId } = await resolveParams(params);

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Create New Page</h1>
                <p className="text-muted-foreground">Fill out the form to create a new custom page.</p>
            </div>
            <BrandWebsitePageForm brandId={brandId} />
        </div>
    )
}
