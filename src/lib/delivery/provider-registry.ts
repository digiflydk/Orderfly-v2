import 'server-only';
import { deliveryIdSchema, providerCapabilitiesSchema, type DeliveryProvider } from './provider-contract';

export type ProviderRegistration = {
  adapter: DeliveryProvider;
  mode: 'test' | 'sandbox' | 'production';
};
export type DeliveryReadiness = {
  bindingVerified: boolean;
  routingVerified: boolean;
  pricingApproved: boolean;
  compensationVerified: boolean;
  providerAcceptanceVerified: boolean;
  reconciliation: 'provider_lookup' | 'manual' | 'unavailable';
};
/** Server-owned evidence only. Never accept these readiness flags from browser input. */
export function deliveryReadinessProblems(entry: ProviderRegistration, environment: 'test' | 'sandbox' | 'production', evidence: DeliveryReadiness): string[] {
  const problems: string[] = [];
  if (entry.mode !== environment) problems.push('provider_environment_mismatch');
  if (environment === 'production' && entry.mode !== 'production') problems.push('test_provider_forbidden');
  if (!evidence.bindingVerified) problems.push('binding_unverified');
  if (!evidence.routingVerified) problems.push('routing_unverified');
  if (!evidence.pricingApproved) problems.push('pricing_unapproved');
  if (!evidence.compensationVerified) problems.push('compensation_unverified');
  if (!evidence.providerAcceptanceVerified) problems.push('provider_acceptance_unverified');
  if (evidence.reconciliation === 'unavailable') problems.push('reconciliation_unavailable');
  if (evidence.reconciliation === 'provider_lookup' && !entry.adapter.capabilities.readByProviderId && !entry.adapter.capabilities.lookupByInternalReference) problems.push('reconciliation_capability_missing');
  return problems;
}
export function createDeliveryProviderRegistry(registrations: readonly ProviderRegistration[]) {
  const providers = new Map<string, ProviderRegistration>();
  for (const registration of registrations) {
    const id = deliveryIdSchema.parse(registration.adapter.providerId);
    providerCapabilitiesSchema.parse(registration.adapter.capabilities);
    if (!['test', 'sandbox', 'production'].includes(registration.mode)) throw new Error('Invalid provider environment');
    if (providers.has(id)) throw new Error('Duplicate delivery provider');
    // Copy metadata and freeze capabilities to prevent readiness changing after registration.
    const capabilities = Object.freeze({...registration.adapter.capabilities});
    const source = registration.adapter;
    const adapter: DeliveryProvider = Object.freeze({providerId:id,capabilities,
      quote:source.quote.bind(source),create:source.create.bind(source),reconcile:source.reconcile.bind(source),cancel:source.cancel.bind(source)});
    providers.set(id, Object.freeze({adapter, mode:registration.mode}));
  }
  return Object.freeze({
    get(providerId:string): ProviderRegistration | null { return providers.get(deliveryIdSchema.parse(providerId)) ?? null; },
    requireReady(providerId:string, environment:'test'|'sandbox'|'production', evidence:DeliveryReadiness):DeliveryProvider {
      const entry=providers.get(deliveryIdSchema.parse(providerId));
      if (!entry) throw new Error('Delivery provider unavailable');
      const problems=deliveryReadinessProblems(entry, environment, evidence);
      if (problems.length) throw new Error(`Delivery provider not ready: ${problems.join(', ')}`);
      return entry.adapter;
    },
  });
}
