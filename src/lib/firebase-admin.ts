// src/lib/firebase-admin.ts
import * as admin from "firebase-admin";

// På Firebase Hosting/Functions kræves ingen ekstra creds.
// Lokalt kan GOOGLE_APPLICATION_CREDENTIALS bruges, men vi forsøger default.
if (!admin.apps.length) {
  admin.initializeApp();
}

export const adminDb = admin.firestore();
export const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
