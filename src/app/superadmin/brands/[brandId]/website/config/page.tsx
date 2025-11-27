
'use server';
import 'server-only';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { getBrandWebsiteConfig } from '@/lib/superadmin/brand-website/config-actions';
import { notFound } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandWebsiteConfigForm } from '@/components/superadmin/brand-website/config/BrandWebsiteConfigForm';
import { BrandWebsiteSeoForm } from '@/components/superadmin/brand-website/config/BrandWebsiteSeoForm';
import { BrandWebsiteSocialForm } from '@/components/superadmin/brand-website/config/BrandWebsiteSocialForm';
import { BrandWebsiteTrackingForm } from '@/components/superadmin/brand-website/config/BrandWebsiteTrackingForm';
import { BrandWebsiteLegalForm } from '@/components/superadmin/brand-website/config/BrandWebsiteLegalForm';
import { BrandWebsiteDesignSystemForm } from '@/components/superadmin/brand-website/config/BrandWebsiteDesignSystemForm';
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";

type BrandConfigParams = {
  brandId: string;
};

export default async function BrandWebsiteConfigPage({ params }: AsyncPageProps<BrandConfigParams>) {
  await requireSuperadmin();
  const { brandId } = await resolveParams(params);
  
  const config = await getBrandWebsiteConfig(brandId);

  if (!config) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="design">Design System</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="social">Social</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="legal">Legal</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <BrandWebsiteConfigForm brandId={brandId} initialConfig={config} />
        </TabsContent>
        <TabsContent value="design">
          <BrandWebsiteDesignSystemForm brandId={brandId} initialDesignConfig={config.designSystem} />
        </TabsContent>
        <TabsContent value="seo">
            <BrandWebsiteSeoForm brandId={brandId} initialSeoConfig={config.seo} />
        </TabsContent>
        <TabsContent value="social">
            <BrandWebsiteSocialForm brandId={brandId} initialSocialConfig={config.social} />
        </TabsContent>
         <TabsContent value="tracking">
            <BrandWebsiteTrackingForm brandId={brandId} initialTrackingConfig={config.tracking} />
        </TabsContent>
        <TabsContent value="legal">
            <BrandWebsiteLegalForm brandId={brandId} initialLegalConfig={config.legal} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
