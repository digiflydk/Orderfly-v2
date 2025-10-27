import 'server-only';
import * as admin from 'firebase-admin';

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

// This is a lazy-loading singleton pattern.
// The Firebase Admin app is only initialized when getAdminApp() is first called.
let adminApp: admin.app.App | undefined;

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

  let serviceAccount: ServiceAccount;
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

  // Use a unique app name to prevent conflicts if this file is somehow loaded multiple times.
  const appName = 'orderfly-admin-singleton';
  const existingApp = admin.apps.find(app => app?.name === appName);
  
  if (existingApp) {
    return existingApp;
  }
  
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  }, appName);

  console.log(`[Firebase Admin] SDK initialized for project: ${app.options.projectId}`);
  return app;
}

/**
 * Returns an initialized instance of the Firebase Admin app using a singleton pattern.
 * This function is the single source of truth for accessing the Admin SDK.
 * @returns {admin.app.App}
 */
export function getAdminApp(): admin.app.App {
  if (!adminApp) {
    adminApp = initializeAdminApp();
  }
  return adminApp;
}

/**
 * Returns a Firestore database instance from the initialized Admin app.
 * @returns {admin.firestore.Firestore}
 */
export function getAdminDb(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}

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
