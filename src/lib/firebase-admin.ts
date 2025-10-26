
import 'server-only';
import * as admin from 'firebase-admin';

// Helper to check if we're in a production-like environment
function isProdLike() {
  const env = process.env.NODE_ENV || 'development';
  return env.toLowerCase() === 'production';
}

function getServiceAccount(): admin.ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
  }
  try {
    let parsed: any;
    // Attempt to parse as JSON, if it fails, assume it's base64 encoded
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    }
    
    const required = ['project_id', 'client_email', 'private_key'];
    for (const k of required) {
      if (!parsed[k]) throw new Error(`Missing field in service account JSON: ${k}`);
    }
    // Some providers strip \n; fix if needed
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  } catch (e: any) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${e?.message ?? 'parse error'}`);
  }
}

if (!admin.apps.length) {
  // Defensive check to ensure ADC is not being used by mistake.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn("WARNING: GOOGLE_APPLICATION_CREDENTIALS is set. This configuration is not recommended. Unset it to rely solely on FIREBASE_SERVICE_ACCOUNT_JSON.");
  }
  
  try {
    const serviceAccount = getServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch(e) {
    console.error("CRITICAL: FIREBASE ADMIN SDK INIT FAILED:", (e as Error).message);
    // In a non-production environment, we can allow the app to continue running
    // with a dummy client to avoid crashing the whole server on startup.
    if (!isProdLike()) {
      console.warn("⚠️ Firebase Admin SDK could not initialize. Using a DUMMY client for development. Firestore operations will fail.");
    } else {
      // In production, it's better to fail fast.
      throw e;
    }
  }
}

// Safely get Firestore instance, or a dummy if init failed in dev
export const getAdminDb = (): admin.firestore.Firestore => {
    if (!admin.apps.length) {
        // Return a dummy object that will throw errors when its methods are called
        return {
            collection: () => { throw new Error('Firebase Admin not initialized.')},
            doc: () => { throw new Error('Firebase Admin not initialized.')},
            batch: () => { throw new Error('Firebase Admin not initialized.') },
            runTransaction: () => { throw new Error('Firebase Admin not initialized.') },
        } as unknown as admin.firestore.Firestore;
    }
    return admin.firestore();
};

export const getAdminApp = () => {
    if (!admin.apps.length) throw new Error('Firebase Admin not initialized.');
    return admin.app();
};

export const getAdminFieldValue = () => {
    if (!admin.apps.length) {
        return {
            serverTimestamp: () => new Date(), // Return a plain date as a fallback
        } as unknown as typeof admin.firestore.FieldValue
    };
    return admin.firestore.FieldValue;
}


export async function adminHealthProbe() {
  if (!admin.apps.length) {
    return { ok: false, error: "Firebase Admin not initialized.", code: "SDK_NOT_INITIALIZED" };
  }
  try {
    // A simple, quick read operation to test connectivity and permissions
    await getAdminDb().collection('__health_check__').limit(1).get();
    return { ok: true, ts: Date.now() };
  } catch (e: any) {
    return { ok: false, error: e.message, code: e.code };
  }
}
