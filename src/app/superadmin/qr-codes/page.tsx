import React from 'react';
import { redirect } from 'next/navigation';
import { AuthorityError } from '@/lib/access/authority';
import { loadQrWorkspace } from '@/lib/qr/runtime';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { QrWorkspace } from './qr-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'QR-koder', robots: { index: false, follow: false } };

export default async function QrCodesPage() {
  try {
    const initial = await loadQrWorkspace();
    return <QrWorkspace initial={initial} />;
  } catch (error) {
    if (error instanceof AuthorityError && error.status === 401) redirect('/admin-login');
    if (error instanceof AuthorityError && error.status === 403) return <AccessDeniedPage />;
    // No cached catalogue or privileged data is rendered on an auth/service
    // failure. Do not expose error text, credentials or provider internals.
    return <section role="alert" className="space-y-3 rounded-lg border p-4"><h1 className="text-xl font-semibold">QR-modulet er midlertidigt utilgængeligt</h1><p>Adgang eller data kunne ikke kontrolleres. Prøv at genindlæse siden senere.</p></section>;
  }
}
