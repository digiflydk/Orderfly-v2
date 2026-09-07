import { initializeApp,getApps,getApp } from 'firebase/app';
import { getFirestore,connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth,connectAuthEmulator } from 'firebase/auth';
const existing=getApps().length>0;
const app=existing?getApp():initializeApp({apiKey:'local-fixture',authDomain:'127.0.0.1',projectId:'demo-orderfly-loyalty'});
export const db=getFirestore(app);
if(!existing){connectFirestoreEmulator(db,'127.0.0.1',8088);connectAuthEmulator(getAuth(app),'http://127.0.0.1:9098',{disableWarnings:true});}
