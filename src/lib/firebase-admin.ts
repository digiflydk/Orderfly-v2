
import 'server-only';
import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

// Force load .env.local variables at the top.
dotenv.config();

type SA = { project_id: string; client_email: string; private_key: string };

function parseServiceAccountJSON(): { projectId: string; clientEmail: string; privateKey: string } {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
  }

  raw = raw.trim();
  const looksBase64 = !raw.startsWith('{');
  if (looksBase64) {
    try {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      throw new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON looks like base64 but cannot be decoded.');
    }
  }

  let sa: SA;
  try {
    sa = JSON.parse(raw) as SA;
  } catch (e: any) {
    throw new Error(`FATAL: Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${e?.message ?? 'parse error'}`);
  }

  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error('FATAL: Service account missing project_id, client_email, or private_key.');
  }

  const privateKey = sa.private_key.replace(/\\n/g, '\n');
  return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey };
}

function assertNoADC() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'FATAL: GOOGLE_APPLICATION_CREDENTIALS is set. Remove it to avoid ADC fallback. We require explicit cert init.'
    );
  }
}

// Use a global symbol to ensure the app is a true singleton.
const ADMIN_APP_SYMBOL = Symbol.for('orderfly.admin.app');

interface GlobalWithAdmin extends NodeJS.Global {
  [ADMIN_APP_SYMBOL]?: admin.app.App;
}

function getAdminApp(): admin.app.App {
  const globalWithAdmin = global as GlobalWithAdmin;
  
  if (!globalWithAdmin[ADMIN_APP_SYMBOL]) {
    assertNoADC();
    const { projectId, clientEmail, privateKey } = parseServiceAccountJSON();
    
    try {
      globalWithAdmin[ADMIN_APP_SYMBOL] = admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        projectId,
      });
      console.log(`[Firebase Admin] SDK initialized successfully for project: ${projectId}.`);
    } catch (error: any) {
       // Catch initialization errors (e.g., if it was already initialized elsewhere without the singleton pattern)
      if (error.code === 'app/duplicate-app') {
        globalWithAdmin[ADMIN_APP_SYMBOL] = admin.app();
      } else {
        throw error;
      }
    }
  }
  
  return globalWithAdmin[ADMIN_APP_SYMBOL]!;
}

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
