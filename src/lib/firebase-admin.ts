
'use server-only';

import * as admin from 'firebase-admin';

let app: admin.app.App | null = null;
let initError: Error | null = null;

function loadServiceAccount(): admin.ServiceAccount | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    initError = new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
    return null;
  }
  try {
    const parsed = JSON.parse(json);
    // Handle \n in private key if needed
    if (parsed.private_key && typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed as admin.ServiceAccount;
  } catch (e) {
    initError = new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON (parse failed).');
    return null;
  }
}

function initializeAdminApp(): admin.app.App | null {
  if (admin.apps.length > 0 && admin.apps[0]) {
    app = admin.apps[0];
    return app;
  }
  const svc = loadServiceAccount();
  if (!svc) return null;

  try {
    app = admin.initializeApp({ credential: admin.credential.cert(svc) });
    return app;
  } catch(e) {
    if (e instanceof Error && e.message.includes('already exists')) {
        app = admin.app();
        return app;
    }
    initError = e as Error;
    return null;
  }
}

export function isAdminReady(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
}

/** Use ONLY in server actions/admin code. Will throw if not configured. */
export function getAdminDb(): admin.firestore.Firestore {
  const a = app || initializeAdminApp();
  if (!a) {
    throw initError ?? new Error('Firebase Admin is not initialized.');
  }
  return a.firestore();
}

/**
 * A helper to get Firestore-specific values like serverTimestamp.
 */
export const getAdminFieldValue = () => {
    return getAdminDb().FieldValue;
};

/**
 * A health check function to verify the connection to Firestore.
 * Returns an error object instead of throwing if the connection fails.
 */
export async function adminHealthProbe() {
    try {
        await getAdminDb().collection('__health_check__').limit(1).get();
        return { ok: true, ts: Date.now() };
    } catch(e:any) {
        return { ok: false, error: e.message, code: e.code };
    }
}
