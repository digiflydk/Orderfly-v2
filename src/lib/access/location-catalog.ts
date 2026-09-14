import 'server-only';
import {getAdminDb} from '@/lib/firebase-admin';
import {AuthorityError, type VerifiedIdentity} from './authority';
import {authorizeTransaction} from './scoped-data';
import {orderflyReadGrants, verifiedOrderflyIdentity} from './orderfly-session';

const idPattern=/^[A-Za-z0-9_-]{1,128}$/;
function id(value:unknown):asserts value is string {
  if(typeof value!=='string'||!idPattern.test(value))throw new AuthorityError('invalid_identifier',400);
}
function locations(data:Record<string,any>):string[] {
  if(!Array.isArray(data.locationIds)||!data.locationIds.length||data.locationIds.length>100)throw new AuthorityError('invalid_scope');
  data.locationIds.forEach(id);
  return [...new Set<string>(data.locationIds)];
}
// Legacy categories and topping groups may span brands and have no brandId.
// Their native locations, rather than a browser-supplied primary brand, own them.
export async function authorizeLocationCatalog(tx:FirebaseFirestore.Transaction,identity:VerifiedIdentity,data:Record<string,any>,permission:string){
  const db=getAdminDb(),byBrand=new Map<string,string[]>();
  for(const locationId of locations(data)){
    const location=await tx.get(db.collection('locations').doc(locationId));
    if(!location.exists)throw new AuthorityError('forbidden');
    const brandId=location.data()!.brandId;id(brandId);
    byBrand.set(brandId,[...(byBrand.get(brandId)||[]),locationId]);
  }
  for(const [brandId,locationIds] of byBrand)await authorizeTransaction(tx,identity,{brandId,locationIds},permission,'locations');
}
export async function mutateLocationCatalog(collection:string,documentId:string,permission:string,update:(before:Record<string,any>|null,tx:FirebaseFirestore.Transaction,identity:VerifiedIdentity)=>Promise<Record<string,any>|null>|Record<string,any>|null){
  id(documentId);const identity=await verifiedOrderflyIdentity(),db=getAdminDb(),ref=db.collection(collection).doc(documentId);
  return db.runTransaction(async tx=>{
    const saved=await tx.get(ref),before=saved.exists?saved.data()!:null;
    if(permission.endsWith(':create')&&before)throw new AuthorityError('record_exists',409);
    if(!permission.endsWith(':create')&&!before)throw new AuthorityError('record_missing',404);
    if(before)await authorizeLocationCatalog(tx,identity,before,permission);
    const after=await update(before,tx,identity);
    if(after)await authorizeLocationCatalog(tx,identity,after,permission);
    if(after)tx.set(ref,after);else tx.delete(ref);
  });
}
export async function getLocationCatalogDocument(collection:string,documentId:string,permission='orderfly.catalog:view'){
  id(documentId);const identity=await verifiedOrderflyIdentity(),db=getAdminDb();
  return db.runTransaction(async tx=>{
    const saved=await tx.get(db.collection(collection).doc(documentId));
    if(!saved.exists)return null;
    await authorizeLocationCatalog(tx,identity,saved.data()!,permission);
    return {...saved.data(),id:documentId};
  });
}
export async function listLocationCatalog(collection:string,brandId?:string){
  if(brandId!==undefined)id(brandId);
  const db=getAdminDb(),grants=await orderflyReadGrants('orderfly.catalog:view'),permitted=new Set<string>();
  for(const grant of grants){
    if(brandId&&grant.brandId!==brandId)continue;
    if(grant.locationIds)for(const value of grant.locationIds)permitted.add(value);
    else {const rows=await db.collection('locations').where('brandId','==',grant.brandId).get();for(const row of rows.docs)permitted.add(row.id);}
  }
  const ids=[...permitted],result=new Map<string,Record<string,any>>();
  for(let offset=0;offset<ids.length;offset+=30){
    const rows=await db.collection(collection).where('locationIds','array-contains-any',ids.slice(offset,offset+30)).get();
    for(const row of rows.docs){const data=row.data();if(locations(data).every(value=>permitted.has(value)))result.set(row.id,{...data,id:row.id});}
  }
  return [...result.values()];
}
export async function reorderLocationCatalog(collection:string,ordered:Array<{id:string;sortOrder:number}>){
  if(!Array.isArray(ordered)||ordered.length>100||new Set(ordered.map(row=>row.id)).size!==ordered.length)throw new AuthorityError('invalid_payload',400);
  for(const row of ordered){id(row.id);if(!Number.isSafeInteger(row.sortOrder))throw new AuthorityError('invalid_payload',400);}
  const identity=await verifiedOrderflyIdentity(),db=getAdminDb();
  await db.runTransaction(async tx=>{
    const updates=[];
    for(const row of ordered){
      const ref=db.collection(collection).doc(row.id),saved=await tx.get(ref);if(!saved.exists)throw new AuthorityError('record_missing',404);
      await authorizeLocationCatalog(tx,identity,saved.data()!,'orderfly.catalog:edit');updates.push({ref,sortOrder:row.sortOrder});
    }
    for(const row of updates)tx.update(row.ref,{sortOrder:row.sortOrder});
  });
}
