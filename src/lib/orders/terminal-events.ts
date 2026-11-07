import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError } from '@/lib/access/authority';
import { resolveKdsScope } from './kds-scope';
import { getOrderTerminalActor, authorizeOrderTerminalTransaction } from '@/lib/terminal-auth/access';

const scopeSchema = z.object({ brandId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).strict();
const ACTIVE = ['Received', 'In Progress', 'Ready'];
const TRACKING = [['deliveryAttempts', 'original'], ['deliveryDispatchResults', 'original'], ['deliveryState', 'current'], ['deliveryEstimates', 'current'], ['deliveryCancellation', 'original']];

/** Notification-only channel. No order, customer, token or policy data leaves it.
 * Every snapshot is still fetched through the existing freshly authorized API.
 * The bounded stream renews authentication before the Cloud Run request timeout.
 */
export async function terminalEvents(request: Request, source: 'kds' | 'terminal') {
  const params = new URL(request.url).searchParams;
  const parsed = scopeSchema.safeParse(Object.fromEntries(params));
  if (!parsed.success || [...params.keys()].some(key => params.getAll(key).length !== 1)) return Response.json({ error: 'invalid_scope' }, { status: 400 });
  const scope = parsed.data, db = getAdminDb();
  let sessionId: string | undefined;
  const authorize = async () => {
    if (source === 'kds') {
      const allowed = await resolveKdsScope();
      if (!allowed.locations.some(row => row.brandId === scope.brandId && row.locationId === scope.locationId)) throw new AuthorityError('forbidden');
    } else {
      const actor = await getOrderTerminalActor('terminal');
      await db.runTransaction(tx => authorizeOrderTerminalTransaction(tx, actor, scope), { readOnly: true });
      if (actor.kind !== 'terminal') throw new AuthorityError('forbidden');
      sessionId = actor.session.sessionId;
    }
  };
  try { await authorize(); }
  catch (error) { return Response.json({ error: 'unavailable' }, { status: error instanceof AuthorityError && [401, 403].includes(error.status) ? error.status : 503, headers: { 'Cache-Control': 'no-store' } }); }
  const guards = [db.collection('brands').doc(scope.brandId), db.collection('locations').doc(scope.locationId),
    ...(source === 'kds' ? [db.collection('platformAdminControl').doc('access-v1')] : [db.collection('terminalSessions').doc(sessionId!), db.collection('terminalCredentials').doc(scope.locationId)])];
  let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false, ready = false;
      const stops: (() => void)[] = [], deliveries = new Map<string, (() => void)[]>();
      const encoder = new TextEncoder();
      let heartbeat: ReturnType<typeof setInterval> | undefined, changed: ReturnType<typeof setTimeout> | undefined;
      const send = (event: string) => { if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`)); };
      const close = (event?: string) => {
        if (closed) return;
        if (event) send(event);
        closed = true; clearInterval(heartbeat); clearTimeout(changed); clearTimeout(lifetime); clearTimeout(startup);
        stops.forEach(stop => stop()); deliveries.forEach(list => list.forEach(stop => stop())); deliveries.clear();
        request.signal.removeEventListener('abort', abort);
        try { controller.close(); } catch { /* Reader cancellation already closes the stream. */ }
      };
      const abort = () => close();
      const lifetime = setTimeout(() => close('reconnect'), 240_000);
      const startup = setTimeout(() => close('unavailable'), 30_000);
      cleanup = abort;
      request.signal.addEventListener('abort', abort, { once: true });
      if (request.signal.aborted) { close(); return; }
      const invalidated = () => {
        if (!ready || closed || changed) return;
        changed = setTimeout(() => { changed = undefined; send('change'); }, 250);
      };
      const failure = () => close('unavailable');
      const initial: Promise<void>[] = [];
      const watch = (ref: FirebaseFirestore.Query | FirebaseFirestore.DocumentReference, callback: (snapshot: any, first: boolean) => void, collection = stops) => {
        let first = true;
        initial.push(new Promise<void>(resolve => {
          const stop = ref.onSnapshot((snapshot: any) => {
            if (closed) return;
            const wasFirst = first; first = false;
            callback(snapshot, wasFirst); resolve();
          }, () => { resolve(); failure(); });
          collection.push(stop);
          if (closed) stop();
        }));
      };
      // Any authority/native-scope change invalidates the channel immediately.
      // Recheck after initial snapshots to close the subscribe/authorize race.
      try {
      guards.forEach(ref => watch(ref, (_snapshot, first) => { if (!first) close('access'); }));
      ACTIVE.forEach(status => watch(db.collection('orders').where('brandId', '==', scope.brandId).where('locationId', '==', scope.locationId).where('status', '==', status), (snapshot: FirebaseFirestore.QuerySnapshot) => {
        for (const change of snapshot.docChanges()) {
          const id = `${status}/${change.doc.id}`;
          if (change.type === 'removed' || !change.doc.data().managedDelivery) {
            deliveries.get(id)?.forEach(stop => stop()); deliveries.delete(id);
          } else if (!deliveries.has(id)) {
            const subscriptions: (() => void)[] = []; deliveries.set(id, subscriptions);
            for (const [collection, document] of TRACKING) watch(change.doc.ref.collection(collection).doc(document), invalidated, subscriptions);
          }
        }
        invalidated();
      }));
      } catch { failure(); return; }
      void (async () => {
        try {
          await Promise.all(initial);
          if (closed) return;
          await authorize();
          if (closed) return;
          ready = true; clearTimeout(startup); send('ready');
          heartbeat = setInterval(() => send('heartbeat'), 15_000);
        } catch (error) { close(error instanceof AuthorityError && [401, 403].includes(error.status) ? 'access' : 'unavailable'); }
      })();
    },
    cancel() { cleanup(); },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', Vary: 'Cookie, Host' } });
}
