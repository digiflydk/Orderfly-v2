
'use server';

import { requireSuperadmin } from '@/lib/auth/superadmin';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { notFound } from 'next/navigation';
import { BrandWebsiteNav, type SectionCompletionStatus } from '@/components/superadmin/brand-website-nav';
import { getBrandWebsiteConfig } from '@/lib/superadmin/brand-website/config-actions';
import { getBrandWebsiteHome } from '@/lib/superadmin/brand-website/home-actions';
import { listBrandWebsitePages } from '@/lib/superadmin/brand-website/pages-actions';
import { getBrandWebsiteMenuSettings } from '@/lib/superadmin/brand-website/menu-settings-actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";
import type { ReactNode } from 'react';

type BrandWebsiteLayoutParams = {
    brandId: string;
};

type BrandWebsiteLayoutProps = AsyncPageProps<BrandWebsiteLayoutParams> & {
  children: ReactNode;
};

export default async function BrandWebsiteLayout({
  children,
  params,
}: BrandWebsiteLayoutProps) {
  await requireSuperadmin();
  const { brandId } = await resolveParams(params);
  const brand = await getBrandById(brandId);

  if (!brand) {
    notFound();
  }

  // Fetch all necessary data for status checks
  const [config, home, pages, menuSettings] = await Promise.all([
    getBrandWebsiteConfig(brandId),
    getBrandWebsiteHome(brandId),
    listBrandWebsitePages(brandId),
    getBrandWebsiteMenuSettings(brandId),
  ]);

  // Compute completion status
  const sectionCompletionStatus: SectionCompletionStatus = {
    config: !!config.template && config.domains.length > 0,
    home: !!home.updatedAt,
    pages: pages.length > 0,
    menuSettings: !!menuSettings.updatedAt,
  };
  
  const primaryDomain = config.domains?.[0];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">
            Brand Website: {brand.name}
            </h1>
            <p className="text-muted-foreground">
            Manage the public-facing marketing website for this brand.
            </p>
        </div>
        
        <Card className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">Status:</span>
                        <Badge variant={config.active ? 'default' : 'secondary'}>
                            {config.active ? 'Active' : 'Inactive'}
                        </Badge>
                    </div>
                     <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">Domains:</span>
                        <Badge variant="outline">
                            {config.domains.length > 0 ? `${config.domains.length} configured` : 'None'}
                        </Badge>
                    </div>
                </div>
                 {config.active && primaryDomain && (
                    <Button variant="outline" size="sm" asChild>
                        <Link href={`https://${primaryDomain}`} target="_blank" rel="noopener noreferrer">
                            Open Public Website <ExternalLink className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                )}
            </div>
             {!config.active && (
                <Alert variant="warning" className="mt-4">
                    <AlertTitle>Website is Inactive</AlertTitle>
                    <AlertDescription>
                        Public visitors cannot see this website until it is activated in the Config tab.
                    </AlertDescription>
                </Alert>
            )}
        </Card>
      </div>

      <BrandWebsiteNav brandId={brand.id} completionStatus={sectionCompletionStatus} />
      
      <div>{children}</div>
    </div>
  );
}
