
import 'server-only';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

// Force load .env.local variables at the top.
dotenv.config();

type SA = { project_id: string; client_email: string; private_key: string };

function initializeAdminApp(): admin.app.App {
  // Prevent re-initialization
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Check for Application Default Credentials, which we want to avoid.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('FATAL: GOOGLE_APPLICATION_CREDENTIALS is set. Remove it to use explicit service account credentials.');
  }
  
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set.');
  }
  
  let rawJson = serviceAccountJson.trim();

  // Handle both raw JSON and base64 encoded JSON
  const looksBase64 = !rawJson.startsWith('{');
  if (looksBase64) {
    try {
      rawJson = Buffer.from(rawJson, 'base64').toString('utf8');
    } catch {
      throw new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON appears to be base64-encoded but could not be decoded.');
    }
  }

  let sa: SA;
  try {
    sa = JSON.parse(rawJson) as SA;
  } catch (e: any) {
    throw new Error(`FATAL: Could not parse FIREBASE_SERVICE_ACCOUNT_JSON: ${e?.message ?? 'Invalid JSON'}`);
  }

  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error('FATAL: Service account JSON is missing required fields (project_id, client_email, or private_key).');
  }

  // The private key from environment variables often has escaped newlines.
  const privateKey = sa.private_key.replace(/\\n/g, '\n');

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey: privateKey,
      }),
      projectId: sa.project_id,
    });
    
    console.log(`[Firebase Admin] SDK initialized successfully for project: ${sa.project_id}.`);
    return app;

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

// Export the admin namespace itself for access to types and other utilities.
export { admin };
