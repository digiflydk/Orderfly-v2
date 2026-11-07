import { resolveKdsScope } from '@/lib/orders/kds-scope';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TerminalPortal } from '@/app/terminal/orders/terminal-portal';
import { TerminalClient } from '@/app/merchant/orders/terminal-client';
import { LogoutButton } from '@/components/superadmin/logout-button';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { orderflySession } from '@/lib/access/orderfly-session';
import { canNavigate } from '@/lib/access/navigation';
import { AuthorityError } from '@/lib/access/authority';

export default async function KitchenDisplayPage({ searchParams }: {
  searchParams: Promise<{ terminal?: string }>;
}) {
  // Explicit terminal mode uses only the dedicated terminal APIs. It never
  // converts an employee session into the terminal's location capability.
  const terminalMode = (await searchParams).terminal === '1';
  if (terminalMode || !(await cookies()).has('__session')) {
    return <TerminalPortal loginHref={terminalMode ? '/kds/login/terminal' : '/kds/login'} />;
  }
  let session, scope;
  try {
    session = await orderflySession();
    if (!canNavigate('/merchant/orders', session)) return <AccessDeniedPage />;
    scope = await resolveKdsScope();
  }
  catch (error) {
    if (error instanceof AuthorityError && error.status === 401) redirect('/kds/login');
    if (error instanceof AuthorityError && error.status === 403) return <AccessDeniedPage />;
    throw error;
  }
  // Employee reads/mutations keep their existing live, scoped permissions.
  return <><LogoutButton loginHref="/kds/login" /><TerminalClient loginHref="/kds/login" initialLocations={scope.locations} apiBase="/api/kds/orders" actionApiBase="/api/merchant/orders" /></>;
}
