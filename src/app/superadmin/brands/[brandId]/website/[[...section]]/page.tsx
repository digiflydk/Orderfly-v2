import { redirect } from 'next/navigation';
import { orderflyReadGrants } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';

export default async function RetiredWebsiteEditor({params}: {params: Promise<{brandId: string}>}) {
  const {brandId} = await params;
  const grants = await orderflyReadGrants('orderfly.website:view');
  if (!grants.some(grant => grant.brandId === brandId)) throw new AuthorityError('forbidden');
  redirect('/superadmin/brands/websites');
}
