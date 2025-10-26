
import 'server-only';
import * as admin from 'firebase-admin';

type SA = { project_id: string; client_email: string; private_key: string };

function loadServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } | null {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: FIREBASE_SERVICE_ACCOUNT_JSON is not set in a production environment.');
    }
    console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT_JSON is not set. Using dummy admin app for development. Firestore operations will fail.");
    return null;
  }
  raw = raw.trim();

  // Accept both base64 and raw JSON
  const looksBase64 = !raw.startsWith('{');
  if (looksBase64) {
    try {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON looks base64 but cannot be decoded.');
    }
  }

  let sa: SA;
  try {
    sa = JSON.parse(raw) as SA;
  } catch (e: any) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${e?.message ?? 'parse error'}`);
  }

  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error('Missing project_id, client_email, or private_key in service account.');
  }

  const privateKey = sa.private_key.replace(/\\n/g, '\n');
  return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey };
}

function assertNoADC() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS is set. Remove it to avoid ADC fallback. We require explicit cert init.'
    );
  }
}

const globalAny = globalThis as any;
if (!globalAny.__OF_ADMIN_APP__) {
  assertNoADC();
  const serviceAccount = loadServiceAccount();
  
  if (serviceAccount) {
      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.projectId,
      });

      const credName = (app.options as any)?.credential?.constructor?.name;
      if (credName !== 'CertCredential') {
        throw new Error(`Firebase Admin initialized with ${credName}, expected CertCredential.`);
      }

      globalAny.__OF_ADMIN_APP__ = app;
  } else {
    // Create a dummy app for local dev without credentials
    globalAny.__OF_ADMIN_APP__ = {
      name: 'dummy-app',
      options: {},
      firestore: () => {
        throw new Error("Firestore is not available. FIREBASE_SERVICE_ACCOUNT_JSON is not set.");
      }
    };
  }
}

export const adminApp = (globalThis as any).__OF_ADMIN_APP__ as admin.app.App;

export const getAdminDb = () => {
    try {
        return admin.firestore(adminApp);
    } catch (e: any) {
        if (e.message.includes("Firestore is not available")) {
            console.error("Firestore operation failed: Firebase Admin SDK was initialized with a dummy app due to missing credentials.");
        }
        throw e;
    }
};

export function _adminDebugInfo() {
  if (adminApp.name === 'dummy-app') {
    return {
      appsCount: 0,
      projectId: 'dummy-project',
      cred: 'DummyCredential',
      note: 'Firebase Admin not initialized. Set FIREBASE_SERVICE_ACCOUNT_JSON.'
    };
  }
  return {
    appsCount: admin.apps.length,
    projectId: (adminApp.options as any).projectId,
    cred: (adminApp.options as any)?.credential?.constructor?.name,
  };
}
export { admin };

// Stub for getAdminFieldValue until it can be properly implemented
export const getAdminFieldValue = () => ({
  serverTimestamp: () => new Date(), 
  // Add other FieldValue methods if needed, returning sensible defaults
  // e.g., increment: (n: number) => n,
});

export async function adminHealthProbe() {
    try {
        await getAdminDb().collection('__health_check__').limit(1).get();
        return { ok: true, ts: Date.now() };
    } catch(e:any) {
        return { ok: false, error: e.message, code: e.code };
    }
}
