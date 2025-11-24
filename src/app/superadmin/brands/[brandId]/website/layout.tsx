import { requireSuperadmin } from '@/lib/auth/superadmin';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { notFound } from 'next/navigation';
import { BrandWebsiteNav } from '@/components/superadmin/brand-website-nav';

export default async function BrandWebsiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { brandId: string };
}) {
  await requireSuperadmin();
  const brand = await getBrandById(params.brandId);

  if (!brand) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Brand Website: {brand.name}
        </h1>
        <p className="text-muted-foreground">
          Manage the public-facing marketing website for this brand.
        </p>
      </div>
      <BrandWebsiteNav brandId={brand.id} />
      <div>{children}</div>
    </div>
  );
}
