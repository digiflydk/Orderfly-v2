
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

// Helper to ensure all parts of the config are serializable
function makeConfigSerializable(config: any) {
  if (!config) return null;
  const safeConfig = { ...config };
  if (config.updatedAt) {
    safeConfig.updatedAt = String(config.updatedAt);
  }
  // Add any other necessary serializations here in the future
  return safeConfig;
}

export default async function BrandWebsiteConfigPage({ params }: { params: { brandId: string } }) {
  await requireSuperadmin();
  
  const config = await getBrandWebsiteConfig(params.brandId);

  if (!config) {
    notFound();
  }
  
  const safeConfig = makeConfigSerializable(config);

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
          <BrandWebsiteConfigForm brandId={params.brandId} initialConfig={safeConfig} />
        </TabsContent>
        <TabsContent value="design">
          <BrandWebsiteDesignSystemForm brandId={params.brandId} initialDesignConfig={safeConfig.designSystem} />
        </TabsContent>
        <TabsContent value="seo">
            <BrandWebsiteSeoForm brandId={params.brandId} initialSeoConfig={safeConfig.seo} />
        </TabsContent>
        <TabsContent value="social">
            <BrandWebsiteSocialForm brandId={params.brandId} initialSocialConfig={safeConfig.social} />
        </TabsContent>
         <TabsContent value="tracking">
            <BrandWebsiteTrackingForm brandId={params.brandId} initialTrackingConfig={safeConfig.tracking} />
        </TabsContent>
        <TabsContent value="legal">
            <BrandWebsiteLegalForm brandId={params.brandId} initialLegalConfig={safeConfig.legal} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
