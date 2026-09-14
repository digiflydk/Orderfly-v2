import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { PaymentGatewaySettings } from '@/types';

// Internal payment helpers must never be exported from a `use server` module:
// Next.js exposes those exports as remotely callable Server Actions.
async function activeGateway() {
  const snapshot = await getAdminDb().collection('platform_settings').doc('payment_gateway').get();
  const settings = snapshot.data() as PaymentGatewaySettings | undefined;
  if (!settings || !['test', 'live'].includes(settings.activeMode)) return null;
  return settings[settings.activeMode];
}

export async function getActiveStripeSecretKey(): Promise<string | null> {
  return (await activeGateway())?.secretKey || null;
}

export async function getActiveStripeWebhookSecret(): Promise<string | null> {
  return (await activeGateway())?.webhookSecret || null;
}

export async function getActiveStripePublishableKey(): Promise<string | null> {
  return (await activeGateway())?.publishableKey || null;
}
