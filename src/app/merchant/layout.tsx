import '@/styles/admin-ui.css';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SuperAdminLayoutClient } from '@/components/superadmin/superadmin-layout-client';
import { getPlatformBrandingSettings } from '@/app/superadmin/settings/queries';
import { orderflySession } from '@/lib/access/orderfly-session';
import { canNavigate } from '@/lib/access/navigation';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

export const metadata: Metadata = { title: 'Merchant • Orderfly' };
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MerchantLayout({children}:{children:React.ReactNode}) {
  const session=await orderflySession().catch(()=>null);
  if(!session)redirect('/admin-login?next=%2Fmerchant');
  const branding=await getPlatformBrandingSettings().catch(()=>null);
  return <SuperAdminLayoutClient access={session} merchantPortal brandingSettings={branding}>
    {canNavigate('/merchant',session)?children:<AccessDeniedPage/>}
  </SuperAdminLayoutClient>;
}
