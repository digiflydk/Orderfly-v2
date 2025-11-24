'use server';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { BrandWebsitePageForm } from '@/components/superadmin/brand-website/pages/BrandWebsitePageForm';

export default async function NewBrandWebsitePage({ params }: { params: { brandId: string }}) {
    await requireSuperadmin();

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Create New Page</h1>
                <p className="text-muted-foreground">Fill out the form to create a new custom page.</p>
            </div>
            <BrandWebsitePageForm brandId={params.brandId} />
        </div>
    )
}
