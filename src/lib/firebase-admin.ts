// src/lib/firebase-admin.ts
import "server-only";
import * as admin from "firebase-admin";

let inited = false;

function doInit() {
  if (inited || admin.apps.length) { inited = true; return; }

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (saJson) {
    try {
      const sa = JSON.parse(saJson);
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: projectId ?? sa.project_id,
      });
      inited = true;
    } catch (e) {
      console.error("[firebase-admin] service account parse/init failed:", e);
      throw e;
    }
  } else {
    // Fallback til ADC hvis tilgængelig — NOTE: kan fejle i Workstations
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
    inited = true;
  }
}

/** Kald KUN denne fra server actions/API-routes der faktisk skal ramme Firestore. */
export function getAdminDb(): FirebaseFirestore.Firestore {
  doInit();
  return admin.firestore();
}

export function getAdminFieldValue() {
  doInit();
  return admin.firestore.FieldValue;
}
