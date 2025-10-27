
import 'server-only';
import * as admin from 'firebase-admin';

// This is a lazy-loading singleton pattern.
// The Firebase Admin app is only initialized when getAdminApp() is first called.

// Use a global symbol to store the app instance to avoid re-initialization during hot-reloads.
const ADMIN_APP_SYMBOL = Symbol.for('orderfly.admin.app');

interface GlobalWithAdmin extends NodeJS.Global {
  [ADMIN_APP_SYMBOL]?: admin.app.App;
}

function initializeAdminApp(): admin.app.App {
  // Check if GOOGLE_APPLICATION_CREDENTIALS is set and throw an error to prevent ADC fallback.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('FATAL: GOOGLE_APPLICATION_CREDENTIALS is set. Unset it to use explicit credentials from FIREBASE_SERVICE_ACCOUNT_JSON.');
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set.');
  }

  let rawJson = serviceAccountJson.trim();
  
  // Handle base64-encoded service accounts.
  if (!rawJson.startsWith('{')) {
    try {
      rawJson = Buffer.from(rawJson, 'base64').toString('utf8');
    } catch (e) {
      throw new Error('Failed to decode base64-encoded FIREBASE_SERVICE_ACCOUNT_JSON.');
    }
  }

  let serviceAccount: { project_id: string; client_email: string; private_key: string; };
  try {
    serviceAccount = JSON.parse(rawJson);
    // Normalize the private key, replacing escaped newlines.
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } catch (e: any) {
    throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${e.message}`);
  }
  
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Service account JSON is missing required fields (project_id, client_email, private_key).');
  }

  // Use a unique app name to prevent conflicts.
  const appName = 'orderfly-admin-singleton';
  const existingApp = admin.apps.find(app => app?.name === appName);
  
  if (existingApp) {
    return existingApp;
  }
  
  console.log(`[Firebase Admin] Initializing SDK for project: ${serviceAccount.project_id}...`);
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  }, appName);

  return app;
}

/**
 * Returns an initialized instance of the Firebase Admin app using a singleton pattern.
 * This function is the single source of truth for accessing the Admin SDK.
 * It will attempt to initialize on first call if not already initialized.
 * @returns {admin.app.App}
 */
export function getAdminApp(): admin.app.App {
  const globalWithAdmin = global as GlobalWithAdmin;
  if (!globalWithAdmin[ADMIN_APP_SYMBOL]) {
    globalWithAdmin[ADMIN_APP_SYMBOL] = initializeAdminApp();
  }
  return globalWithAdmin[ADMIN_APP_SYMBOL]!;
}

/**
 * Returns a Firestore database instance from the initialized Admin app.
 * This is the primary export to be used by server actions.
 * @returns {admin.firestore.Firestore}
 */
export function getAdminDb(): admin.firestore.Firestore {
  try {
    return getAdminApp().firestore();
  } catch (e: any) {
    // If the error during initialization was because the env var was not set,
    // this will be the point where the error is thrown to the caller.
    if (e.message.includes("FIREBASE_SERVICE_ACCOUNT_JSON")) {
       console.error("Firestore is not available. ", e.message);
    }
    // Re-throw to make it clear that the DB operation will fail.
    throw e;
  }
}

// Export the admin namespace itself for access to types and other utilities.
export { admin };

/**
 * A helper to get Firestore-specific values like serverTimestamp.
 */
export const getAdminFieldValue = () => {
    // This is a simplified getter for FieldValues like serverTimestamp.
    // In a more complex setup, you might need to handle multiple Firebase app instances.
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
