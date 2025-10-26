
import 'server-only';
import * as admin from 'firebase-admin';

let db: admin.firestore.Firestore;
let app: admin.app.App;

// Helper to check if we're in a production-like environment
function isProdLike() {
  const env = process.env.NODE_ENV || 'development';
  return env.toLowerCase() === 'production';
}

function getServiceAccount(): admin.ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    // Only throw in production. In dev, we can proceed with a dummy client.
    if (isProdLike()) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set in a production environment.');
    }
    console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_JSON is not set. Using a dummy Firestore client. Backend operations will fail.');
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    const required = ['project_id', 'client_email', 'private_key'];
    for (const k of required) {
      if (!parsed[k]) throw new Error(`Missing field in service account: ${k}`);
    }
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
  const serviceAccount = getServiceAccount();
  if (serviceAccount) {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    db = admin.firestore();
  } else {
    // Create a dummy app/db if service account is not available (dev only)
    app = admin.initializeApp();
    db = admin.firestore();
    console.warn("🔥 Firebase Admin SDK initialized with a DUMMY client. Real database calls will fail.");
  }
} else {
  app = admin.app();
  db = admin.firestore();
}

export function getAdminDb() {
  return db;
}

export function getAdminApp() {
  return app;
}

export function getAdminFieldValue() {
  return admin.firestore.FieldValue;
}

export async function adminHealthProbe() {
  try {
    // A lightweight check: try to list collections. This fails if creds are wrong.
    await getAdminDb().listCollections();
    return { ok: true, ts: Date.now() };
  } catch (e: any) {
    return { ok: false, error: e.message, code: e.code };
  }
}
