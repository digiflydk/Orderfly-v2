
import { redirect } from 'next/navigation';
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";

type BrandWebsiteRootParams = {
  brandId: string;
};

export default async function BrandWebsiteRootPage({ params }: AsyncPageProps<BrandWebsiteRootParams>) {
  const { brandId } = await resolveParams(params);
  redirect(`/superadmin/brands/${brandId}/website/config`);
}
