
'use server';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { listBrandWebsitePages } from '@/lib/superadmin/brand-website/pages-actions';
import { BrandWebsitePagesClient } from '@/components/superadmin/brand-website/pages/BrandWebsitePagesClient';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";

type PageParams = {
    brandId: string;
};

export default async function BrandWebsitePagesListPage({ params }: AsyncPageProps<PageParams>) {
  await requireSuperadmin();
  const { brandId } = await resolveParams(params);
  const pages = await listBrandWebsitePages(brandId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">Website Pages</h1>
            <p className="text-muted-foreground">Manage custom content pages for the brand website.</p>
        </div>
        <Button asChild>
            <Link href={`/superadmin/brands/${brandId}/website/pages/new`}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create New Page
            </Link>
        </Button>
      </div>
      <BrandWebsitePagesClient brandId={brandId} initialPages={pages} />
    </div>
  );
}
