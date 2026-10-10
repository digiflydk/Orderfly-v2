import { redirect } from 'next/navigation';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';

export default async function RetiredMarketingEditor({params}: {params: Promise<{section?: string[]}>}) {
  await requirePlatformSuperuser();
  const {section = []} = await params;
  redirect(section.join('/') === 'settings/cookie-texts'
    ? '/superadmin/settings/cookie-texts'
    : '/superadmin/settings');
}
