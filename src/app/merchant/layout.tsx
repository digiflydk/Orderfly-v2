import '@/styles/admin-ui.css';
import { merchantInstallMetadata } from '@/lib/server/merchant-home-screen';
import { redirect } from 'next/navigation';
import { SuperAdminLayoutClient } from '@/components/superadmin/superadmin-layout-client';
import { getPlatformBrandingSettings } from '@/app/superadmin/settings/queries';
import { orderflySession } from '@/lib/access/orderfly-session';
import { canNavigate, counterOnly } from '@/lib/access/navigation';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

export const generateMetadata = merchantInstallMetadata;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MerchantLayout({children}:{children:React.ReactNode}) {
  const session=await orderflySession().catch(()=>null);
  if(!session)redirect('/login');
  // Counter-only staff get the counter view full screen, without the admin menu.
  if(counterOnly(session))return <div className="admin-shell min-h-screen bg-background text-foreground">{children}</div>;
  const branding=await getPlatformBrandingSettings().catch(()=>null);
  return <SuperAdminLayoutClient access={session} merchantPortal brandingSettings={branding}>
    {canNavigate('/merchant',session)?children:<AccessDeniedPage/>}
  </SuperAdminLayoutClient>;
}
