import 'server-only';
import { orderflySession } from '@/lib/access/orderfly-session';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { getTerminalSession, authorizeTerminalTransaction, type TerminalSession } from './core';

export type OrderTerminalActor =
  | { kind: 'admin'; session: Awaited<ReturnType<typeof orderflySession>>; actorId: string; name: string }
  | { kind: 'terminal'; session: TerminalSession; actorId: string; name: string };
export type OrderTerminalAuthSource = 'admin' | 'terminal';
/** Source is chosen by a fixed server route, never by a query/body or cookie fallback. */
export async function getOrderTerminalActor(source: OrderTerminalAuthSource = 'admin'): Promise<OrderTerminalActor> {
  if (source === 'terminal') {
    const session = await getTerminalSession();
    if (!session) throw new AuthorityError('unauthorized', 401);
    return { kind: 'terminal', session, actorId: session.actorId, name: `Terminal · ${session.locationName}` };
  }
  const session = await orderflySession();
  if (session.actorId !== principalKey(session.identity)) throw new AuthorityError('forbidden');
  return { kind: 'admin', session, actorId: session.actorId, name: session.name };
}
export async function authorizeOrderTerminalTransaction(tx: FirebaseFirestore.Transaction, actor: OrderTerminalActor,
  scope: { brandId: string; locationId: string }) {
  if (actor.kind === 'terminal') {
    await authorizeTerminalTransaction(tx, actor.session, scope.brandId, scope.locationId);
  } else {
    await authorizeTransaction(tx, actor.session.identity, scope, 'orderfly.orders:edit', 'location');
  }
}
