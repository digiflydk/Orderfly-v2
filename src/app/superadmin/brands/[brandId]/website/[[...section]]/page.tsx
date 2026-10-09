import { requireOrderflyAccess } from '@/lib/access/orderfly-session';
import { redirect } from 'next/navigation';
export default async function StandardWebsite({params}: {params: Promise<{brandId: string}>}) {
  const {brandId} = await params;
  await requireOrderflyAccess(brandId, null, 'orderfly.website:view');
  redirect('/superadmin/brands/websites');
}
