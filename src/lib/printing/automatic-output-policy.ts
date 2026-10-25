import 'server-only';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { BrandAutomaticPrint } from './brand-automatic-print-schema';
import { prepareSavedPrinterRouting } from './saved-routing';
import { credentialSchema } from './device-credentials-service';

/** Current routed kitchen targets, not a snapshot captured during a pilot. Every
 * invocation runs in the producer/transport's own native transaction. */
export async function prepareAutomaticOutputTargets(context: NativeTransactionContext, scope: { brandId: string; locationId: string }, setting: BrandAutomaticPrint) {
  if (!setting.enabled || setting.brandId !== scope.brandId || !setting.activationId || setting.enabledAt === null
    || process.env.ORDERFLY_PRINT_INTENTS_ENABLED !== 'true' || process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') return [];
  const location = await context.transaction.get(context.db.collection('locations').doc(scope.locationId));
  const row = location.data();
  if (!location.exists || row?.brandId !== scope.brandId || row.isActive === false || row.deletedAt != null
    || ['deleted', 'isDeleted', 'isTestData'].some(key => row[key] !== undefined && row[key] !== false)) return [];
  const routing = await prepareSavedPrinterRouting(context, scope);
  const selectedIds = new Set(routing.rules.filter(rule => rule.effect === 'include').map(rule => rule.printerId));
  if (routing.revision === null || !selectedIds.size) return [];
  const targets = routing.printers.filter(printer => selectedIds.has(printer.configuration.id));
  if (targets.length !== selectedIds.size || targets.some(({ configuration: p }) => p.state !== 'active' || p.transport !== 'cloudprnt-http' || p.manufacturer !== 'star')) return [];
  const credentials = await Promise.all(targets.map(async printer => {
    const saved = await context.transaction.get(context.db.collection('locations').doc(scope.locationId).collection('printers')
      .doc(printer.configuration.id).collection('deviceCredentials').doc('current'));
    const parsed = credentialSchema.safeParse(saved.data());
    return parsed.success && parsed.data.brandId === scope.brandId && parsed.data.locationId === scope.locationId
      && parsed.data.printerId === printer.configuration.id && parsed.data.printerRevision === printer.revision
      && parsed.data.revokedAt === null && parsed.data.issuedAt <= Date.now();
  }));
  // Suppress the complete ticket when any configured route cannot print. Never
  // silently lose lines by selecting only the currently available targets.
  if (credentials.some(valid => !valid)) return [];
  return targets.map(printer => Object.freeze({ configuration: printer.configuration, printerRevision: printer.revision,
    kinds: Object.freeze(['kitchen'] as const), dispatchAuthorized: false as const }));
}
