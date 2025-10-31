
'use server';

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
    initError = new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. Cannot initialize Firebase Admin.');
    return null;
  }

  try {
    const parsed = JSON.parse(raw.trim());
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('Service account JSON is missing required fields (project_id, client_email, private_key).');
    }
    // Correctly format the private key
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // This will be thrown at runtime if credentials are bad.
    initError = new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. Ensure it is valid JSON. Details: ${message}`);
    return null;
  }
}

function initializeAdminApp(): admin.app.App {
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
  
  try {
    return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      }, appName);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    initError = new Error(`Firebase Admin initialization failed: ${message}`);
    throw initError;
  }
}

function getAdminApp(): admin.app.App {
  if (initError) {
    throw initError;
  }
  
  if (!adminApp) {
    if (admin.apps.length > 0 && admin.apps[0]) {
      adminApp = admin.apps[0];
    } else {
      adminApp = initializeAdminApp();
    }
  }
  return adminApp;
}

/**
 * Returns an initialized Firestore database instance from the admin SDK.
 * This is the primary export to be used by server-side code.
 * Will throw a descriptive error if the Admin SDK is not configured.
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
    return getAdminApp().firestore.FieldValue;
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
