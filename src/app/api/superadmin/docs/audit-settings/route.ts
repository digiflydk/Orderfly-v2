
// src/app/api/superadmin/docs/audit-settings/route.ts
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';

type AuditActionConfig = {
  action: string;
  description: string;
  enabled: boolean;
  level: 'info' | 'warning' | 'error';
};

const AUDIT_ACTIONS: AuditActionConfig[] = [
  {
    action: 'order.created',
    description: 'A new order was created by a customer.',
    enabled: true,
    level: 'info',
  },
  {
    action: 'order.status.changed',
    description: 'Order status changed by restaurant or system.',
    enabled: true,
    level: 'info',
  },
  {
    action: 'order.payment.succeeded',
    description: 'A customer payment was successfully processed.',
    enabled: true,
    level: 'info',
  },
  {
    action: 'order.payment.failed',
    description: 'A customer payment attempt failed.',
    enabled: true,
    level: 'warning',
  },
  {
    action: 'superadmin.brand.created',
    description: 'Superadmin created a new brand.',
    enabled: true,
    level: 'info',
  },
  {
    action: 'superadmin.brand.updated',
    description: 'Superadmin updated brand configuration.',
    enabled: true,
    level: 'info',
  },
    {
    action: 'superadmin.brand.deleted',
    description: 'Superadmin deleted a brand.',
    enabled: true,
    level: 'warning',
  },
  {
    action: 'superadmin.user.created',
    description: 'A new user was created in the Superadmin panel.',
    enabled: true,
    level: 'info',
  },
    {
    action: 'superadmin.user.deleted',
    description: 'A user was deleted from the Superadmin panel.',
    enabled: true,
    level: 'warning',
  },
  {
    action: 'superadmin.settings.payment.updated',
    description: 'Payment gateway settings were updated.',
    enabled: true,
    level: 'warning',
  },
  {
    action: 'superadmin.settings.analytics.updated',
    description: 'Global analytics settings were updated.',
    enabled: true,
    level: 'info',
  }
];

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    actions: AUDIT_ACTIONS,
  });
}
