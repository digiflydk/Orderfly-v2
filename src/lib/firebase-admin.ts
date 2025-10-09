
import * as admin from "firebase-admin";

let app: admin.app.App | undefined;

/**
 * Returnerer en singleton Firebase Admin App
 * Bruger FIREBASE_SERVICE_ACCOUNT fra environment som JSON
 */
export function getAdminApp(): admin.app.App {
  if (!app) {
    try {
      // Brug eksisterende instans hvis den findes
      app = admin.app();
    } catch {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT missing or empty");
      }

      const serviceAccount = JSON.parse(raw);

      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  }
  return app!;
}

/**
 * Returnerer Firestore Admin instance.
 * Bruges i alle server routes (fx /api/ops/catalog/...).
 */
export function getAdminDb(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}
