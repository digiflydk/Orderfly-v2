import { redirect } from 'next/navigation';
import { mpanelAdminEnabled, MPANEL_ADMIN_URL } from '@/lib/mpanel-admin-cutover';
export default function Layout({children}:{children:React.ReactNode}) {
  if(mpanelAdminEnabled()) redirect(MPANEL_ADMIN_URL);
  return children;
}
