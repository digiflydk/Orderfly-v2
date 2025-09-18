// src/lib/firebase-admin.ts
import "server-only";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  // I Firebase Frameworks/Functions miljø får vi Application Default Credentials
  admin.initializeApp();
}

export const adminDb = admin.firestore();
export const adminFieldValue = admin.firestore.FieldValue;
