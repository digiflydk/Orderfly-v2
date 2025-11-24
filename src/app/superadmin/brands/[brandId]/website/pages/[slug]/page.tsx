'use server';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { getBrandWebsitePage } from '@/lib/superadmin/brand-website/pages-actions';
import { notFound } from 'next/navigation';
import { BrandWebsitePageForm } from '@/components/superadmin/brand-website/pages/BrandWebsitePageForm';

export default async function EditBrandWebsitePage({ params }: { params: { brandId: string, slug: string }}) {
    await requireSuperadmin();
    const page = await getBrandWebsitePage(params.brandId, params.slug);

    if (!page) {
        notFound();
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Edit Page</h1>
                <p className="text-muted-foreground">Editing details for page: "{page.title}"</p>
            </div>
            <BrandWebsitePageForm brandId={params.brandId} page={page} />
        </div>
    )
}
