import 'server-only';
import * as admin from 'firebase-admin';

// This file is the single source of truth for initializing the Firebase Admin SDK.
// It uses a lazy-loading singleton pattern to ensure that the SDK is initialized
// exactly once and only when it's first needed. This is crucial for Next.js
// environments where environment variables might not be available at build time.

type SA = { project_id: string; client_email: string; private_key: string };

let adminApp: admin.app.App | null = null;

function loadServiceAccount(): SA {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set.');
  }

  try {
    const parsed = JSON.parse(raw.trim());
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('Service account JSON is missing required fields.');
    }
    return parsed;
  } catch (e) {
    throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. Ensure it is valid JSON.');
  }
}

function initializeAdminApp(): admin.app.App {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('WARNING: GOOGLE_APPLICATION_CREDENTIALS is set. Forcing explicit credential from FIREBASE_SERVICE_ACCOUNT_JSON to avoid ambiguity.');
  }

  const serviceAccount = loadServiceAccount();

  const appName = `orderfly-admin-${Date.now()}`;
  
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
    }),
    projectId: serviceAccount.project_id,
  }, appName);
}

function getAdminApp(): admin.app.App {
  if (!adminApp) {
    if (admin.apps.length > 0) {
      adminApp = admin.apps[0]!;
    } else {
      adminApp = initializeAdminApp();
    }
  }
  return adminApp;
}

/**
 * Returns an initialized Firestore database instance from the admin SDK.
 * This is the primary export to be used by server-side code.
 */
export function getAdminDb(): admin.firestore.Firestore {
  try {
    return getAdminApp().firestore();
  } catch(e:any) {
    if (e.message.includes("Firestore is not available")) {
        console.error("Firestore operation failed: Firebase Admin SDK was initialized with a dummy app due to missing credentials.");
    }
    throw e;
  }
}

// Export the admin namespace itself for access to types and other utilities.
export { admin };

/**
 * A helper to get Firestore-specific values like serverTimestamp.
 */
export const getAdminFieldValue = () => {
    return admin.firestore.FieldValue;
};

/**
 * A health check function to verify the connection to Firestore.
 */
export async function adminHealthProbe() {
    try {
        await getAdminDb().collection('__health_check__').limit(1).get();
        return { ok: true, ts: Date.now() };
    } catch(e:any) {
        return { ok: false, error: e.message, code: e.code };
    }
}
