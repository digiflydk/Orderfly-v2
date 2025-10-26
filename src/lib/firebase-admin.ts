

import 'server-only';
import * as admin from 'firebase-admin';

let app: admin.app.App | undefined;

/**
 * Returnerer en singleton Firebase Admin App
 * Bruger FIREBASE_SERVICE_ACCOUNT fra environment som JSON
 */
export function getAdminApp(): admin.app.App {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set.");
    }
    const serviceAccount = JSON.parse(raw);
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    app = admin.app();
  }
  return app!;
}

/**
 * Returnerer Firestore Admin instance.
 * Bruges i alle server routes (fx /api/ops/catalog/...).
 */
export function getAdminDb(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}

export async function adminHealthProbe() {
  return { ok: true, ts: Date.now() };
}

export function getAdminFieldValue<T = unknown>(_path: string, _fallback?: T): T | undefined {
  return _fallback;
}
