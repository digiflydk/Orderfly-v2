
'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { authorizeLocationCatalog, getLocationCatalogDocument, listLocationCatalog, mutateLocationCatalog, reorderLocationCatalog } from '@/lib/access/location-catalog';

import type { Product, Topping, ToppingGroup } from '@/types';
import { catalogIdentifier, toppingGroupSchema, toppingSchema } from '@/lib/superadmin/topping-catalog-schema';
import { getProducts } from '@/app/superadmin/products/actions';
import { isSyntheticProduct } from '@/lib/synthetic-product';
import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';

// Bounded queries are deliberately fail-closed rather than silently ignoring usage.
async function groupProducts(tx: FirebaseFirestore.Transaction, groupId: string) {
  const rows = await tx.get(getAdminDb().collection('products').where('toppingGroupIds', 'array-contains', groupId).limit(501));
  if (rows.size > 500) throw new Error('Gruppen bruges på for mange produkter til denne handling.');
  return rows.docs;
}
function refreshCatalog() { revalidatePath('/superadmin/toppings'); revalidateTag('storefront'); }
function removalValid(group: Record<string, any>, option: Record<string, any>) {
  if (group.kind === 'removal' && (option.price !== 0 || option.isDefault === true || (option.maxQuantity ?? 1) !== 1 || option.productId)) throw new Error('Fravalg skal være gratis, uden standardvalg, uden produktreference og med maksimum 1.');
}
async function validateLinkedProduct(tx: FirebaseFirestore.Transaction, option: Record<string, any>) {
  if (!option.productId) return;
  catalogIdentifier.parse(option.productId);
  const db = getAdminDb(), saved = await tx.get(db.collection('products').doc(option.productId));
  const product = saved.data();
  if (!saved.exists || !product || product.isActive !== true || !Array.isArray(product.locationIds) || isSyntheticProduct(product) || product.toppingGroupIds?.length) throw new Error('Vælg et aktivt almindeligt produkt uden egne tilvalg.');
  for (const locationId of option.locationIds) {
    const location = await tx.get(db.collection('locations').doc(locationId));
    if (!location.exists || location.data()?.brandId !== product.brandId || (product.locationIds?.length && !product.locationIds.includes(locationId))) throw new Error('Produktet skal tilhøre samme brand og alle valgte lokationer.');
  }
}

export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdateToppingGroup(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const rawData: Record<string, any> = Object.fromEntries(formData.entries());

  rawData.locationIds = formData.getAll('locationIds');

  const validatedFields = toppingGroupSchema.safeParse(rawData);

  if (!validatedFields.success) {
    const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
    return { message: `Validation failed: ${errorMessages || "Check your inputs."}`, error: true };
  }

  const { id, ...groupData } = validatedFields.data;

  try {
    const groupId=id||getAdminDb().collection('topping_groups').doc().id;
    await mutateLocationCatalog('topping_groups',groupId,id?'orderfly.catalog:edit':'orderfly.catalog:create',async(before,tx)=>{
      const effectiveGroup = {...before,...groupData};
      if(before){const children=await tx.get(getAdminDb().collection('toppings').where('groupId','==',groupId).limit(101));
        if(children.size>100)throw new AuthorityError('too_many_records',409);
        if(children.docs.some(child=>!Array.isArray(child.data().locationIds)||!child.data().locationIds.every((location:string)=>groupData.locationIds.includes(location))))throw new AuthorityError('group_has_toppings_outside_scope',409);
        for (const child of children.docs) removalValid(effectiveGroup, child.data());
        const uses = await groupProducts(tx, groupId);
        if (uses.length && (before.kind ?? 'addition') !== (effectiveGroup.kind ?? 'addition')) throw new Error('Fjern gruppen fra produkterne før gruppetypen ændres.');
      }
      return {...before,...groupData,id:groupId};
    });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Kunne ikke gemme tilvalgsgruppen: ${errorMessage}`, error: true };
  }
  refreshCatalog();
  redirect('/superadmin/toppings');
}

export async function deleteToppingGroup(groupId: string) {
    try {
        if(!/^[A-Za-z0-9_-]{1,128}$/.test(groupId))throw new AuthorityError('invalid_identifier',400);
        const identity=await verifiedOrderflyIdentity(),db=getAdminDb();
        await db.runTransaction(async tx=>{
            const ref=db.collection('topping_groups').doc(groupId),group=await tx.get(ref);
            if(!group.exists)throw new AuthorityError('record_missing',404);
            await authorizeLocationCatalog(tx,identity,group.data()!,'orderfly.catalog:delete');
            const children=await tx.get(db.collection('toppings').where('groupId','==',groupId).limit(101));
            if(children.size>100)throw new AuthorityError('too_many_records',409);
            if ((await groupProducts(tx, groupId)).length) throw new Error('Tilvalgsgruppen bruges på produkter. Fjern tilknytningerne før sletning.');
            for(const child of children.docs)await authorizeLocationCatalog(tx,identity,child.data(),'orderfly.catalog:delete');
            for(const child of children.docs)tx.delete(child.ref);
            tx.delete(ref);
        });

        refreshCatalog();
        return { message: "Tilvalgsgruppen og dens tilvalg er slettet.", error: false };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Kunne ikke slette tilvalgsgruppen: ${errorMessage}`, error: true };
    }
}


export async function createOrUpdateTopping(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {

  const rawData: Record<string, any> = {};

  const id = formData.get('id') as string | null;
  if (id) {
    rawData.id = id;
  }

  formData.forEach((value, key) => {
      if (key === 'locationIds') {
          if (!rawData[key]) rawData[key] = [];
          (rawData[key] as string[]).push(value as string);
      } else {
          rawData[key] = value;
      }
  });

  rawData.isActive = formData.has('isActive');
  rawData.isDefault = formData.has('isDefault');

  const validatedFields = toppingSchema.safeParse(rawData);

  if (!validatedFields.success) {
    const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
    return {
      message: `Validation failed: ${errorMessages}`,
      error: true,
    };
  }

  const { id: validatedId, ...toppingData } = validatedFields.data;

  try {
    const toppingId=validatedId||getAdminDb().collection('toppings').doc().id;
    await mutateLocationCatalog('toppings',toppingId,validatedId?'orderfly.catalog:edit':'orderfly.catalog:create',async(before,tx,identity)=>{
      if(!/^[A-Za-z0-9_-]{1,128}$/.test(toppingData.groupId))throw new AuthorityError('invalid_identifier',400);
      const group=await tx.get(getAdminDb().collection('topping_groups').doc(toppingData.groupId));
      if(!group.exists||!toppingData.locationIds.every(location=>group.data()!.locationIds?.includes(location)))throw new AuthorityError('invalid_group_scope');
      await authorizeLocationCatalog(tx,identity,group.data()!,'orderfly.catalog:view');
      const next = {...before,...toppingData,id:toppingId};
      if (formData.has('productId') && !toppingData.productId) delete next.productId;
      removalValid(group.data()!, next);
      await validateLinkedProduct(tx, next);
      if (before && before.groupId !== toppingData.groupId && (await groupProducts(tx, before.groupId)).length) throw new Error('Tilvalget bruges på produkter og kan ikke flyttes til en anden gruppe.');
      return next;
    });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Kunne ikke gemme tilvalget: ${errorMessage}`, error: true };
  }

  refreshCatalog();
  redirect('/superadmin/toppings');
}

export async function deleteTopping(toppingId: string) {
    try {
        await mutateLocationCatalog('toppings',toppingId,'orderfly.catalog:delete',async(before,tx)=>{
          if (before && (await groupProducts(tx, before.groupId)).length) throw new Error('Tilvalget bruges på produkter. Fjern gruppetilknytningerne før sletning.');
          return null;
        });
        refreshCatalog();
        return { message: "Tilvalget er slettet.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Kunne ikke slette tilvalget: ${errorMessage}`, error: true };
    }
}

export async function updateToppingSortOrder(orderedToppings: {id: string, sortOrder: number}[]) {
    try {
        await reorderLocationCatalog('toppings',orderedToppings);
        refreshCatalog();
        return { message: 'Rækkefølgen af tilvalg er opdateret.', error: false };
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Kunne ikke opdatere rækkefølgen af tilvalg: ${errorMessage}`, error: true };
    }
}


async function publicLocation(locationId:string){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(locationId))return false;
  const location=await getAdminDb().collection('locations').doc(locationId).get();return location.exists&&location.data()?.isActive===true;
}
export async function getToppingGroups(locationId?: string): Promise<ToppingGroup[]> {
  if(!locationId)return (await listLocationCatalog('topping_groups') as ToppingGroup[]).sort((a,b)=>a.groupName.localeCompare(b.groupName));
  if(!await publicLocation(locationId))return [];
  const rows=await getAdminDb().collection('topping_groups').where('locationIds','array-contains',locationId).get();
  return rows.docs.map(doc=>{const d=doc.data();return {id:doc.id,locationIds:[locationId],groupName:d.groupName,minSelection:d.minSelection,maxSelection:d.maxSelection,displayName:d.displayName,kind:d.kind,selectionMode:d.selectionMode,sortOrder:d.sortOrder} as ToppingGroup;}).sort((a,b)=>a.groupName.localeCompare(b.groupName));
}
export async function getToppingGroupById(id:string):Promise<ToppingGroup|null>{return await getLocationCatalogDocument('topping_groups',id) as ToppingGroup|null;}
export async function getToppings(locationId?: string): Promise<Topping[]> {
  if(!locationId)return (await listLocationCatalog('toppings') as Topping[]).sort((a,b)=>a.toppingName.localeCompare(b.toppingName));
  if(!await publicLocation(locationId))return [];
  const rows=await getAdminDb().collection('toppings').where('locationIds','array-contains',locationId).where('isActive','==',true).get();
  return rows.docs.map(doc=>{const d=doc.data();return {id:doc.id,locationIds:[locationId],groupId:d.groupId,toppingName:d.toppingName,price:d.price,isActive:true,isDefault:d.isDefault===true,sortOrder:d.sortOrder,maxQuantity:d.maxQuantity,productId:d.productId} as Topping;}).sort((a,b)=>(a.sortOrder??999)-(b.sortOrder??999));
}
export async function getToppingById(id:string):Promise<Topping|null>{return await getLocationCatalogDocument('toppings',id) as Topping|null;}

export async function getToppingProducts(): Promise<Product[]> {
  return (await getProducts()).filter(product => product.isActive && !isSyntheticProduct(product) && !product.toppingGroupIds?.length).sort((a,b)=>a.productName.localeCompare(b.productName));
}
export async function getToppingUsage(): Promise<Record<string,{products:{id:string;name:string}[];count:number}>> {
  const [groups, products] = await Promise.all([getToppingGroups(), getProducts()]);
  return Object.fromEntries(groups.map(group => {
    const used = products.filter(product => product.toppingGroupIds?.includes(group.id)).map(product => ({id:product.id,name:product.productName}));
    return [group.id,{products:used,count:used.length}];
  }));
}
export async function duplicateToppingGroup(groupId:string):Promise<FormState & {id?:string}> {
  try {
    catalogIdentifier.parse(groupId);
    const db=getAdminDb(),identity=await verifiedOrderflyIdentity(),copyRef=db.collection('topping_groups').doc();
    await db.runTransaction(async tx=>{
      const source=await tx.get(db.collection('topping_groups').doc(groupId));
      if(!source.exists)throw new Error('Tilvalgsgruppen findes ikke.');
      const group=source.data()!;
      await authorizeLocationCatalog(tx,identity,group,'orderfly.catalog:view');
      await authorizeLocationCatalog(tx,identity,group,'orderfly.catalog:create');
      const children=await tx.get(db.collection('toppings').where('groupId','==',groupId).limit(101));
      if(children.size>100)throw new Error('En gruppe kan højst kopieres med 100 tilvalg ad gangen.');
      const copies=[];
      for(const child of children.docs){
        const data=child.data();
        await authorizeLocationCatalog(tx,identity,data,'orderfly.catalog:view');
        await authorizeLocationCatalog(tx,identity,data,'orderfly.catalog:create');
        removalValid(group,data);await validateLinkedProduct(tx,data);
        const ref=db.collection('toppings').doc();
        copies.push({ref,data:{...data,id:ref.id,groupId:copyRef.id}});
      }
      tx.create(copyRef,{...group,id:copyRef.id,groupName:`${group.groupName.slice(0,190)} (kopi)`});
      for(const copy of copies)tx.create(copy.ref,copy.data);
    });
    refreshCatalog();return {error:false,message:'Tilvalgsgruppen er kopieret.',id:copyRef.id};
  }catch(error){return {error:true,message:error instanceof Error?error.message:'Gruppen kunne ikke kopieres.'};}
}
export async function duplicateTopping(toppingId:string):Promise<FormState & {id?:string}> {
  try {
    catalogIdentifier.parse(toppingId);
    const db=getAdminDb(),identity=await verifiedOrderflyIdentity(),copyRef=db.collection('toppings').doc();
    await db.runTransaction(async tx=>{
      const source=await tx.get(db.collection('toppings').doc(toppingId));
      if(!source.exists)throw new Error('Tilvalget findes ikke.');
      const data=source.data()!;
      await authorizeLocationCatalog(tx,identity,data,'orderfly.catalog:view');
      await authorizeLocationCatalog(tx,identity,data,'orderfly.catalog:create');
      const group=await tx.get(db.collection('topping_groups').doc(data.groupId));
      if(!group.exists)throw new Error('Tilvalgsgruppen findes ikke.');
      await authorizeLocationCatalog(tx,identity,group.data()!,'orderfly.catalog:view');
      removalValid(group.data()!,data);await validateLinkedProduct(tx,data);
      tx.create(copyRef,{...data,id:copyRef.id,toppingName:`${data.toppingName.slice(0,190)} (kopi)`,isDefault:false});
    });
    refreshCatalog();return {error:false,message:'Tilvalget er kopieret.',id:copyRef.id};
  }catch(error){return {error:true,message:error instanceof Error?error.message:'Tilvalget kunne ikke kopieres.'};}
}
