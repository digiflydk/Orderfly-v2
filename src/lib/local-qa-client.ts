import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import type { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import type { Firestore, connectFirestoreEmulator } from 'firebase/firestore';

const project = 'demo-orderfly-qa0';
const origin = 'http://127.0.0.1:3100';
/** Validate public configuration before any Firebase SDK initialization. */
export function localQaClientEnvironment(config: FirebaseOptions, settings: { enabled?: string; mode?: string; origin?: string }) {
  if (settings.enabled === undefined) {
    if (config.projectId === project || config.apiKey === 'qa0-public-only' || config.appId === 'qa0-local') throw Error('Local QA client opt-in is required');
    return null;
  }
  if (settings.enabled !== 'true' || settings.mode !== 'development' || settings.origin !== origin
    || config.projectId !== project || config.apiKey !== 'qa0-public-only' || config.authDomain !== '127.0.0.1'
    || config.appId !== 'qa0-local' || config.storageBucket !== undefined || config.messagingSenderId !== undefined) throw Error('Local QA client configuration rejected');
  return Object.freeze({ projectId: project, origin });
}
export function assertLocalQaClientApp(app: FirebaseApp, local: ReturnType<typeof localQaClientEnvironment>) {
  if (local ? app.options.projectId !== project || app.options.apiKey !== 'qa0-public-only' || app.options.authDomain !== '127.0.0.1'
    || app.options.appId !== 'qa0-local' || app.options.storageBucket !== undefined || app.options.messagingSenderId !== undefined
    : app.options.projectId === project || app.options.apiKey === 'qa0-public-only' || app.options.appId === 'qa0-local') throw Error('Local QA client runtime scope changed');
}
type Binding = { db: Firestore; auth?: Auth; authConnected: boolean; firestoreConnected: boolean };
const key = Symbol.for('orderfly.qa0.client-emulator-bindings.v1');
function bindings(): WeakMap<FirebaseApp, Binding> {
  const old = Reflect.get(globalThis, key);
  if (old !== undefined) { if (!(old instanceof WeakMap)) throw Error('Local QA client binding state rejected'); return old; }
  const value = new WeakMap<FirebaseApp, Binding>();
  Object.defineProperty(globalThis, key, { value, writable: false, configurable: false });
  return value;
}
/** SDK calls only; this never grants native session, policy or dispatch authority. */
export function bindLocalQaClient(app: FirebaseApp, db: Firestore, sdk: { getAuth: typeof getAuth; connectAuthEmulator: typeof connectAuthEmulator; connectFirestoreEmulator: typeof connectFirestoreEmulator }) {
  assertLocalQaClientApp(app, { projectId: project, origin });
  const map = bindings();
  let state = map.get(app);
  if (state && state.db !== db) throw Error('Local QA client Firestore instance changed');
  if (!state) { state = { db, authConnected: false, firestoreConnected: false }; map.set(app, state); }
  if (!state.authConnected) {
    state.auth ??= sdk.getAuth(app);
    sdk.connectAuthEmulator(state.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    state.authConnected = true;
  }
  if (!state.firestoreConnected) { sdk.connectFirestoreEmulator(db, '127.0.0.1', 8088); state.firestoreConnected = true; }
}
