
'use server';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { getBrandWebsitePage } from '@/lib/superadmin/brand-website/pages-actions';
import { notFound } from 'next/navigation';
import { BrandWebsitePageForm } from '@/components/superadmin/brand-website/pages/BrandWebsitePageForm';
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";

type PageParams = {
    brandId: string;
    slug: string;
};

export default async function EditBrandWebsitePage({ params }: AsyncPageProps<PageParams>) {
    await requireSuperadmin();
    const { brandId, slug } = await resolveParams(params);
    const page = await getBrandWebsitePage(brandId, slug);

    if (!page) {
        notFound();
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Edit Page</h1>
                <p className="text-muted-foreground">Editing details for page: "{page.title}"</p>
            </div>
            <BrandWebsitePageForm brandId={brandId} page={page} />
        </div>
    )
}
