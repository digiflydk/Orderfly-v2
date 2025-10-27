
import 'server-only';
import * as admin from 'firebase-admin';

// Define a type for the service account to ensure type safety.
type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

// A global variable to hold the initialized Firebase Admin app instance (singleton).
const globalAny = globalThis as any;

/**
 * Parses the service account JSON from environment variables.
 * Supports both raw JSON and base64-encoded JSON.
 * @returns {ServiceAccount} The parsed service account object.
 */
function parseServiceAccount(): ServiceAccount {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error('CRITICAL: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. The Admin SDK requires this for server-side authentication.');
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

  try {
    const parsed = JSON.parse(rawJson);
    // Normalize the private key, replacing escaped newlines.
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
  } catch (e: any) {
    throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${e.message}`);
  }
}

/**
 * Lazily initializes the Firebase Admin SDK using a singleton pattern.
 * This function ensures that the Admin SDK is initialized only once.
 * @returns {admin.app.App} The initialized Firebase Admin app.
 */
function initializeAdminApp(): admin.app.App {
  if (globalAny.__OF_ADMIN_APP__) {
    return globalAny.__OF_ADMIN_APP__;
  }

  const serviceAccount = parseServiceAccount();
  
  // Explicitly check for GOOGLE_APPLICATION_CREDENTIALS to prevent ADC fallback.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('Warning: GOOGLE_APPLICATION_CREDENTIALS is set. This configuration will be ignored in favor of FIREBASE_SERVICE_ACCOUNT_JSON.');
  }

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  }, 'orderfly-admin-app'); // Give the app a unique name

  console.log(`[Firebase Admin] SDK initialized for project: ${app.options.projectId}`);
  globalAny.__OF_ADMIN_APP__ = app;
  
  return app;
}

/**
 * Returns an initialized instance of the Firebase Admin app.
 * @returns {admin.app.App}
 */
export function getAdminApp(): admin.app.App {
  return initializeAdminApp();
}

/**
 * Returns a Firestore database instance from the initialized Admin app.
 * @returns {admin.firestore.Firestore}
 */
export function getAdminDb(): admin.firestore.Firestore {
    return getAdminApp().firestore();
}

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
