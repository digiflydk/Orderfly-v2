
import 'server-only';
import * as admin from 'firebase-admin';

// This file is the single source of truth for initializing the Firebase Admin SDK.
// It uses a lazy-loading singleton pattern to ensure that the SDK is initialized
// exactly once and only when it's first needed. This is crucial for Next.js
// environments where environment variables might not be available at build time.

type SA = { project_id: string; client_email: string; private_key: string };

let adminApp: admin.app.App | null = null;
let initError: Error | null = null;

function loadServiceAccount(): SA | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    // We create a "soft" error here that will only be thrown if the Admin SDK is actually used.
    // This allows public pages to build and run without the admin credentials.
    initError = new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set.');
    return null;
  }

  try {
    const parsed = JSON.parse(raw.trim());
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('Service account JSON is missing required fields (project_id, client_email, private_key).');
    }
    return parsed;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // This will be thrown at runtime if credentials are bad.
    initError = new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. Ensure it is valid JSON. Details: ${message}`);
    return null;
  }
}

function initializeAdminApp(): admin.app.App {
  // If there was a previous initialization error, throw it immediately.
  if (initError) {
    throw initError;
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    // This will now only be thrown if an attempt is made to use the Admin SDK without the env var.
    throw new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. Cannot initialize Firebase Admin.');
  }

  // Prevent accidental use of Application Default Credentials.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('FATAL: GOOGLE_APPLICATION_CREDENTIALS should not be set. Use FIREBASE_SERVICE_ACCOUNT_JSON exclusively.');
  }

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
    // Check if an app is already initialized (e.g., by another part of Firebase)
    if (admin.apps.length > 0 && admin.apps[0]) {
      adminApp = admin.apps[0];
    } else {
      // Lazy initialization: create the app on first access.
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
  return getAdminApp().firestore();
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
