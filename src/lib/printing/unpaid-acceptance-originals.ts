import 'server-only';
import { createHash } from 'node:crypto';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { readPickupAcceptanceCapability, type PickupAcceptanceCapability } from '@/lib/server/accept-pickup-checkout';
import { preparePrintIntentTargetPolicy } from './intent-target-policy';
import { projectNativePrintCatalog } from './catalog-line-projection';
import { prepareSavedPrinterRouting } from './saved-routing';
import { previewPrinterRouting } from './routing-preview';
import { preparePickupAcceptancePrintIntents } from './outbox';

/** Rebuilt in the actual acceptance transaction, before either plan writes.
 * This cannot accept a client order/projection or mint an acceptance capability.
 * Process OFF deliberately retains the broader existing checkout tenant IDs.
 */
export async function prepareUnpaidAcceptanceOriginals(context: NativeTransactionContext, capability: PickupAcceptanceCapability) {
  const authority = readPickupAcceptanceCapability(context, capability);
  if (process.env.ORDERFLY_PRINT_INTENTS_ENABLED !== 'true') return null;
  const { id: orderId, brandId, locationId } = authority.order;
  const scope = { brandId, locationId };
  const policy = await preparePrintIntentTargetPolicy(context, { ...scope, orderId });
  if (!policy.enabled) return null;
  const [catalog, saved] = await Promise.all([
    projectNativePrintCatalog(context, { orderId, ...scope }), prepareSavedPrinterRouting(context, scope),
  ]);
  if (saved.revision === null || !saved.rules.length) throw new Error('Saved printer routing required');
  const routing = previewPrinterRouting({ scope: catalog.scope, deliveryType: catalog.deliveryType, lines: catalog.lines,
    rules: saved.rules, printers: saved.printers.map(row => ({ configuration: row.configuration, deleted: false })) });
  if (routing.unrouted.length || !routing.targets.length) throw new Error('Order has unrouted print lines');
  const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const targets: Array<{ printerId: string; printerRevision: number; configurationHash: string;
    kinds: Array<'kitchen' | 'packing'>; lineIds: string[] }> = [];
  const intents = routing.targets.flatMap(target => {
    const selected = policy.targets.find(row => row.configuration.id === target.printerId);
    const current = saved.printers.find(row => row.configuration.id === target.printerId);
    if (!selected || !current || selected.printerRevision !== current.revision) throw new Error('Routing target is not enabled by current print policy');
    targets.push({ printerId: target.printerId, printerRevision: selected.printerRevision,
      configurationHash: fingerprint(selected.configuration), kinds: [...selected.kinds].sort(), lineIds: target.lines.map(line => line.lineId) });
    return selected.kinds.map(kind => ({ ...scope, orderId, printerId: target.printerId, kind }));
  });
  return preparePickupAcceptancePrintIntents(context, capability, { intents, identity: {
    schemaVersion: 1, id: 'original', orderId, ...scope, originalRevision: 0,
    ...(policy.automaticActivationId ? { automaticActivationId: policy.automaticActivationId } : {}), policyRevision: policy.policyRevision, routingRevision: saved.revision,
    rulesHash: fingerprint(saved.rules), catalogHash: fingerprint(catalog), targets,
  } });
}
