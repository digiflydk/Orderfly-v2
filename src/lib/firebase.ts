

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// This configuration uses only NEXT_PUBLIC_ variables, which are available
// on both the server and the client, ensuring a consistent and valid setup.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// 🔍 Debug: show which Firebase project is being used
if (firebaseConfig.projectId) {
  console.log("🔥 Project ID in use:", firebaseConfig.projectId);
} else {
  console.warn("⚠️ Firebase projectId is not configured. Check your .env file for NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
}


// Initialize Firebase (singleton pattern)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore
let db: any = null;

try {
  db = getFirestore(app);
} catch(e) {
  console.error("Firestore could not be initialized on the client. This may be normal in a server-only context.");
}

export { db };
