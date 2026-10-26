import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {getAdminDb} from '@/lib/firebase-admin';

const MAX_QUOTES_PER_DAY=100;
const MAX_REQUESTS_PER_SECOND=5;
const timestamp=z.number().int().nonnegative().safe();
const dailySchema=z.object({version:z.literal(1),day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),count:z.number().int().min(1).max(MAX_QUOTES_PER_DAY)}).strict();
const rateSchema=z.object({version:z.literal(1),lastSeenAtMs:timestamp,reservations:z.array(timestamp).min(1).max(MAX_REQUESTS_PER_SECOND)}).strict();

export function isGeoapifyQuotaNamespace(value:unknown):value is string {
  return typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

/** Server configuration must use one stable namespace for every consumer of a key/project,
 * including environments sharing that quota. Changing it creates a new budget: do not rotate
 * it with credentials or derive it from a tenant/location. No raw API key belongs here.
 * The server-composed adapter must reserve one quote before its per-request reservations.
 * Reservations are never refunded, including failed/unknown provider outcomes.
 * Construction performs no I/O; callbacks reserve before the adapter's actual outbound calls.
 */
export function createGeoapifyBudget(options:{quotaNamespace:string;db?:FirebaseFirestore.Firestore;now?:()=>number}) {
  if(!isGeoapifyQuotaNamespace(options.quotaNamespace))throw new Error('geoapify_quota_configuration_invalid');
  const namespaceHash=createHash('sha256').update(JSON.stringify(['geoapify',options.quotaNamespace])).digest('hex');
  const now=options.now??Date.now;
  const document=(suffix:string)=>(options.db??getAdminDb()).collection('deliveryRoutingBudgets').doc(`${namespaceHash}-${suffix}`);
  return {
    async reserveQuote():Promise<boolean>{
      try {
        const at=timestamp.parse(now()),day=new Date(at).toISOString().slice(0,10);
        // Reject dates outside the ordinary four-digit UTC document format.
        if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
        const db=options.db??getAdminDb(),ref=document(day);
        return await db.runTransaction(async tx=>{
          const snapshot=await tx.get(ref);
          const prior=snapshot.exists?dailySchema.parse(snapshot.data()):null;
          if(prior&&prior.day!==day)return false;
          if(prior&&prior.count>=MAX_QUOTES_PER_DAY)return false;
          tx.set(ref,{version:1,day,count:(prior?.count??0)+1});
          return true;
        });
      }catch{return false;}
    },
    async reserveRequest():Promise<boolean>{
      try {
        const at=timestamp.parse(now()),db=options.db??getAdminDb(),ref=document('requests');
        return await db.runTransaction(async tx=>{
          const snapshot=await tx.get(ref),prior=snapshot.exists?rateSchema.parse(snapshot.data()):null;
          if(prior&&(prior.lastSeenAtMs>at||prior.reservations.some((v,i,a)=>v>prior.lastSeenAtMs||(i>0&&v<a[i-1]))))return false;
          const reservations=(prior?.reservations??[]).filter(value=>value>at-1000);
          if(reservations.length>=MAX_REQUESTS_PER_SECOND)return false;
          tx.set(ref,{version:1,lastSeenAtMs:at,reservations:[...reservations,at]});
          return true;
        });
      }catch{return false;}
    },
  };
}
