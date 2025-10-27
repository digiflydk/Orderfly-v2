
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
 * Lazily initializes the Firebase Admin SDK.
 * This function ensures that the Admin SDK is initialized only once.
 * It will throw a clear error if the service account credentials are not configured.
 * @returns {admin.app.App} The initialized Firebase Admin app.
 */
function initializeAdminApp(): admin.app.App {
  // If the app is already initialized, return the existing instance.
  if (globalAny.__OF_ADMIN_APP__) {
    return globalAny.__OF_ADMIN_APP__;
  }

  // Check that GOOGLE_APPLICATION_CREDENTIALS is not set, to avoid conflicts.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS environment variable is set. Please unset it to allow explicit initialization via service account JSON.');
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error('The FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set. The Admin SDK requires this for server-side authentication.');
  }

  let serviceAccount: ServiceAccount;
  try {
    let rawJson = serviceAccountJson.trim();
    // Handle base64-encoded service accounts.
    if (!rawJson.startsWith('{')) {
      rawJson = Buffer.from(rawJson, 'base64').toString('utf8');
    }
    serviceAccount = JSON.parse(rawJson);
  } catch (e: any) {
    throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${e.message}`);
  }

  // Validate the parsed service account object.
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('The parsed service account is missing required fields (project_id, client_email, private_key).');
  }

  // Initialize the app with the explicit credential.
  const app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
    }),
    projectId: serviceAccount.project_id,
  });

  // Store the initialized app in the global scope to act as a singleton.
  globalAny.__OF_ADMIN_APP__ = app;
  
  console.log(`[OF-469] Firebase Admin SDK initialized for project: ${app.options.projectId}`);
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
 * This is the primary function to be used by server actions.
 * @returns {admin.firestore.Firestore}
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
