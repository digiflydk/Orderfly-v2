import { redirect } from 'next/navigation';

export default function BrandWebsiteRootPage({ params }: { params: { brandId: string } }) {
  redirect(`/superadmin/brands/${params.brandId}/website/config`);
}
