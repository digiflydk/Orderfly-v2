import type { PaymentGatewaySettings } from '@/types';

type Mode = 'test' | 'live';
const MODES: Mode[] = ['test', 'live'];

// What the Superadmin settings page may receive. Publishable keys are public by
// design; secret and webhook keys are write-only and never leave the server (#57).
export type PaymentGatewaySettingsView = {
  activeMode: Mode;
  test: { publishableKey: string; secretKeySet: boolean; webhookSecretSet: boolean };
  live: { publishableKey: string; secretKeySet: boolean; webhookSecretSet: boolean };
};

export function redactPaymentGatewaySettings(settings: PaymentGatewaySettings): PaymentGatewaySettingsView {
  const view = (mode: Mode) => ({
    publishableKey: settings[mode]?.publishableKey || '',
    secretKeySet: !!settings[mode]?.secretKey,
    webhookSecretSet: !!settings[mode]?.webhookSecret,
  });
  return { activeMode: settings.activeMode === 'live' ? 'live' : 'test', test: view('test'), live: view('live') };
}

// An empty secret field means "keep the stored value". Only a newly typed value
// replaces a stored secret, so saving other settings never wipes or echoes it.
// The optional webhook secret can be removed with an explicit clear choice.
export function mergeStoredPaymentSecrets(submitted: PaymentGatewaySettings, stored: PaymentGatewaySettings | null | undefined,
  clearWebhookSecret: Partial<Record<Mode, boolean>> = {}): PaymentGatewaySettings {
  const merged: PaymentGatewaySettings = { ...submitted, test: { ...submitted.test }, live: { ...submitted.live } };
  for (const mode of MODES) {
    if (!merged[mode].secretKey && stored?.[mode]?.secretKey) merged[mode].secretKey = stored[mode].secretKey;
    if (clearWebhookSecret[mode] && !merged[mode].webhookSecret) merged[mode].webhookSecret = '';
    else if (!merged[mode].webhookSecret && stored?.[mode]?.webhookSecret) merged[mode].webhookSecret = stored[mode].webhookSecret;
  }
  return merged;
}
