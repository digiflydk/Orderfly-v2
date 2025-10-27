
import 'server-only';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

// Force load .env.local variables at the top.
dotenv.config();

type SA = { project_id: string; client_email: string; private_key: string };

function loadServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } | null {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    // In a real production/preview environment, this should ideally be a hard failure.
    // For development and ease of use in Studio, we'll log an error and allow a dummy app.
    if (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview') {
       throw new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set in a production/preview environment.');
    }
    console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_JSON is not set. A dummy app will be used for local development. Firestore operations will fail.');
    return null;
  }
  
  raw = raw.trim();

  const looksBase64 = !raw.startsWith('{');
  if (looksBase64) {
    try {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      throw new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON appears to be base64-encoded but cannot be decoded.');
    }
  }

  let sa: SA;
  try {
    sa = JSON.parse(raw) as SA;
  } catch (e: any) {
    throw new Error(`FATAL: Could not parse FIREBASE_SERVICE_ACCOUNT_JSON: ${e?.message ?? 'Invalid JSON'}`);
  }

  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error('FATAL: Service account JSON is missing required fields (project_id, client_email, or private_key).');
  }

  const privateKey = sa.private_key.replace(/\\n/g, '\n');
  return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey };
}

function assertNoADC() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('WARNING: GOOGLE_APPLICATION_CREDENTIALS is set. This is not recommended. Explicit service account is preferred.');
  }
}


function initializeAdminApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  assertNoADC();
  const serviceAccount = loadServiceAccount();

  if (!serviceAccount) {
    // Initialize a dummy app for local development without credentials
    return admin.initializeApp({ projectId: `dummy-project-${Date.now()}`});
  }

  try {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });
  } catch (error: any) {
    if (error.code === 'app/duplicate-app') {
      return admin.app();
    }
    throw error;
  }
}

// Use a lazy-loading singleton pattern
let adminAppInstance: admin.app.App | null = null;
function getAdminApp(): admin.app.App {
  if (!adminAppInstance) {
    adminAppInstance = initializeAdminApp();
  }
  return adminAppInstance;
}

/**
 * Returns an initialized Firestore database instance from the admin SDK.
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
