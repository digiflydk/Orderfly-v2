import { redirect } from 'next/navigation';

export default function LegacyMerchantAppPage() {
  redirect('/kds/login/terminal');
}
