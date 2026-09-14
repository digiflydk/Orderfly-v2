import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

// Legacy server modules use the modular Firestore calling convention. Keep it
// server-only while public browser access to the business database is retired.
// Authentication and tenant checks remain the responsibility of each entrypoint.
type Reference = { id: string; path: string; kind: 'collection' | 'document'; constraints?: Array<(query: any) => any> };
export const db = { path: '' };
export { Timestamp };
export type DocumentData = Record<string, any>;
export type QueryConstraint = (query: any) => any;
export type Query = Reference;
export type DocumentReference = Reference;
export const collection = (parent: {path: string}, path: string): Reference => ({id:path.split('/').at(-1)!,path: [parent.path, path].filter(Boolean).join('/'), kind: 'collection'});
export const doc = (parent: {path: string}, ...segments: string[]): Reference => {const path=[parent.path,...segments,...(segments.length?[]:[getAdminDb().collection(parent.path).doc().id])].filter(Boolean).join('/');return {id:path.split('/').at(-1)!,path,kind:'document'};};
const native = (ref: Reference): any => ref.kind === 'document' ? getAdminDb().doc(ref.path) : (ref.constraints || []).reduce((query, apply) => apply(query), getAdminDb().collection(ref.path));
const snapshot = (saved: any) => ({ id: saved.id, ref: {id:saved.id,path:saved.ref.path,kind:'document'} as Reference, _snapshot:saved, exists: () => saved.exists, data: () => saved.data() });
export const getDoc = async (ref: Reference) => snapshot(await native(ref).get());
export const getDocs = async (ref: Reference) => { const saved = await native(ref).get(); const docs: Array<ReturnType<typeof snapshot>> = saved.docs.map(snapshot); return {docs, empty:saved.empty, size:saved.size, forEach:(fn:(doc:ReturnType<typeof snapshot>)=>void)=>docs.forEach(fn)}; };
export const query = (ref: Reference, ...constraints: QueryConstraint[]): Reference => ({...ref, constraints:[...(ref.constraints || []), ...constraints]});
export const where = (field: string, operator: any, value: any): QueryConstraint => query => query.where(field, operator, value);
export const orderBy = (field: string, direction?: 'asc' | 'desc'): QueryConstraint => query => query.orderBy(field, direction || 'asc');
export const limit = (count: number): QueryConstraint => query => query.limit(count);
export const startAfter = (value: any): QueryConstraint => query => query.startAfter(value?._snapshot || value);
export const setDoc = async (ref: Reference, data: any, options?: any) => options ? native(ref).set(data, options) : native(ref).set(data);
export const updateDoc = async (ref: Reference, data: any) => native(ref).update(data);
export const deleteDoc = async (ref: Reference) => native(ref).delete();
export const addDoc = async (ref: Reference, data: any) => {const saved=await native(ref).add(data);return {id:saved.id,path:saved.path,kind:'document' as const};};
export const serverTimestamp = () => FieldValue.serverTimestamp();
export const increment = (value: number) => FieldValue.increment(value);
export const arrayUnion = (...values: any[]) => FieldValue.arrayUnion(...values);
export const deleteField = () => FieldValue.delete();
export const documentId = () => '__name__';
export async function runTransaction<T>(_db: unknown, run: (tx: any) => Promise<T>): Promise<T> {
  return getAdminDb().runTransaction(async tx => run({
    get: async (ref: Reference) => snapshot(await tx.get(native(ref))),
    set: (ref: Reference, data: any, options?: any) => options ? tx.set(native(ref), data, options) : tx.set(native(ref), data),
    update: (ref: Reference, data: any) => tx.update(native(ref), data),
    delete: (ref: Reference) => tx.delete(native(ref)),
  }));
}
export const writeBatch = (_db: unknown) => {
 const batch=getAdminDb().batch();
 return {set:(ref:Reference,data:any,options?:any)=>options?batch.set(native(ref),data,options):batch.set(native(ref),data),update:(ref:Reference,data:any)=>batch.update(native(ref),data),delete:(ref:Reference)=>batch.delete(native(ref)),commit:()=>batch.commit()};
};
