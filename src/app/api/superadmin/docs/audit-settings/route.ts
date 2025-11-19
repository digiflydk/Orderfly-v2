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
    action: 'superadmin.brand.updated',
    description: 'Superadmin updated brand configuration.',
    enabled: true,
    level: 'info',
  },
  // Extend with more as needed
];

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    actions: AUDIT_ACTIONS,
  });
}
