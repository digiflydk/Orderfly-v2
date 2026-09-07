import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { PaymentGatewaySettings } from '@/types';

// Never export secret getters from a "use server" module: those are callable RPCs.
export async function readPaymentGatewaySettings(): Promise<PaymentGatewaySettings> {
  const snap = await getAdminDb().collection('platform_settings').doc('payment_gateway').get();
  return snap.data() as PaymentGatewaySettings || {
    activeMode: 'test', test: { publishableKey: '', secretKey: '', webhookSecret: '' },
    live: { publishableKey: '', secretKey: '', webhookSecret: '' },
  };
}
export async function getActiveStripeSecretKey() {
  const settings = await readPaymentGatewaySettings();
  return settings[settings.activeMode]?.secretKey || null;
}
export async function getActiveStripeWebhookSecret() {
  const settings = await readPaymentGatewaySettings();
  return settings[settings.activeMode]?.webhookSecret || null;
}
