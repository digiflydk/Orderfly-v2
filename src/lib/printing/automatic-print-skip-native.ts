import 'server-only';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { automaticPrintSkipSchema, type AutomaticPrintSkipReason } from './automatic-print-skip';
/** Read before all writes; apply only with the caller's successful acceptance or settlement.
 * One immutable, location-scoped decision per order. Never creates a print job. */
export async function prepareAutomaticPrintSkip(context: NativeTransactionContext, scope: { brandId: string; locationId: string; orderId: string }, reason: AutomaticPrintSkipReason) {
  const value = automaticPrintSkipSchema.parse({ schemaVersion: 1, ...scope, reason, createdAt: Date.now() });
  const ref = context.db.collection('locations').doc(scope.locationId).collection('automaticPrintSkips').doc(scope.orderId);
  const [location, order, prior] = await Promise.all([context.transaction.get(context.db.collection('locations').doc(scope.locationId)),
    context.transaction.get(context.db.collection('orders').doc(scope.orderId)), context.transaction.get(ref)]);
  if (!location.exists || location.data()?.brandId !== scope.brandId || !order.exists || order.data()?.brandId !== scope.brandId || order.data()?.locationId !== scope.locationId) throw new Error('print_skip_scope');
  if (prior.exists) {
    const saved = automaticPrintSkipSchema.parse(prior.data());
    if (saved.orderId !== scope.orderId || saved.brandId !== scope.brandId || saved.locationId !== scope.locationId) throw new Error('print_skip_scope');
  }
  let applied = false;
  return { writeCount: prior.exists ? 0 : 1, apply() {
    if (applied) throw new Error('print_skip_already_applied');
    applied = true;
    if (!prior.exists) context.transaction.create(ref, value);
  } };
}
