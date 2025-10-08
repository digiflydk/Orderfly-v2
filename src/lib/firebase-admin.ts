
// src/lib/firebase-admin.ts
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

type ServiceAccountShape = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function parseServiceAccount(): ServiceAccountShape {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT ?? "";
  if (!raw.trim()) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing");
  }

  // Accept JSON string OR base64-encoded JSON
  let jsonText = raw;
  if (/^[A-Za-z0-9+/=]+$/.test(raw.trim())) {
    try {
      jsonText = Buffer.from(raw.trim(), "base64").toString("utf8");
    } catch {
      // fall through – treat as JSON text
    }
  }

  // Some platforms escape newlines in private_key
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing required fields");
  }

  // Normalize private_key newlines
  parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
  return parsed as ServiceAccountShape;
}

let app: App | null = null;
let db: Firestore | null = null;

function getAdminApp(): App {
  if (app) return app;

  const sa = parseServiceAccount();
  const options = {
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
    projectId: sa.project_id,
  };

  app = getApps()[0] ?? initializeApp(options);
  return app;
}

export function getAdminDb(): Firestore {
  if (db) return db;
  const a = getAdminApp();
  db = getFirestore(a);
  return db!;
}

// Lightweight health reader (used by /api/diag/health & /api/debug/all)
export async function adminHealthProbe() {
  try {
    const database = getAdminDb();
    // Cheap reads to verify access & token refresh:
    const brandsSnap = await database.collection("brands").limit(1).get();
    const locationsSnap = await database.collection("locations").limit(1).get();

    return {
      ok: true,
      brandsCountHint: brandsSnap.size,
      locationsCountHint: locationsSnap.size,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: String(err?.message ?? err),
    };
  }
}
