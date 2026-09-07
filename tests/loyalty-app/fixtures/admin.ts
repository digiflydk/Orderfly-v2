import 'server-only';
import * as admin from 'firebase-admin';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9098') throw Error('Local QA emulators required');
export function getAdminApp() { return admin.apps.find(a => a?.name === 'loyalty-browser') || admin.initializeApp({projectId:'demo-orderfly-loyalty'},'loyalty-browser'); }
export function getAdminDb() { return getAdminApp().firestore(); }
export { admin };
export const getAdminFieldValue = () => admin.firestore.FieldValue;
