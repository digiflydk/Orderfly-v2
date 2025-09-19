// src/lib/firebase-admin.ts
import "server-only";
import * as admin from "firebase-admin";

function initAdmin() {
  if (admin.apps.length) return;

  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT; // Secret: fuld JSON
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (saJson) {
    const sa = JSON.parse(saJson);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: projectId ?? sa.project_id,
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }
}
initAdmin();

export const adminDb = admin.firestore();
export const adminFieldValue = admin.firestore.FieldValue;
