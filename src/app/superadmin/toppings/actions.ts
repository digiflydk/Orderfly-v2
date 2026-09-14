
'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { authorizeLocationCatalog, getLocationCatalogDocument, listLocationCatalog, mutateLocationCatalog, reorderLocationCatalog } from '@/lib/access/location-catalog';

import type { Topping, ToppingGroup } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const toppingGroupSchema = z.object({
  id: z.string().optional(),
  locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
  groupName: z.string().min(2, { message: 'Group name must be at least 2 characters.' }),
  minSelection: z.coerce.number().min(0, "Min selection must be 0 or more."),
  maxSelection: z.coerce.number().min(0, "Max selection must be 0 or more."),
}).refine(data => data.maxSelection === 0 || data.maxSelection >= data.minSelection, {
    message: "Max selection must be 0 (for unlimited) or greater than or equal to min selection.",
    path: ["maxSelection"],
});

const toppingSchema = z.object({
  id: z.string().optional(),
  locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
  groupId: z.string().min(1, { message: 'A topping group must be selected.' }),
  toppingName: z.string().min(2, { message: 'Topping name must be at least 2 characters.' }),
  price: z.coerce.number().min(0, { message: 'Price must be a non-negative number.' }),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.coerce.number().optional(),
});

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
      if(before){const children=await tx.get(getAdminDb().collection('toppings').where('groupId','==',groupId).limit(101));
        if(children.size>100)throw new AuthorityError('too_many_records',409);
        if(children.docs.some(child=>!Array.isArray(child.data().locationIds)||!child.data().locationIds.every((location:string)=>groupData.locationIds.includes(location))))throw new AuthorityError('group_has_toppings_outside_scope',409);
      }
      return {...before,...groupData,id:groupId};
    });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save topping group: ${errorMessage}`, error: true };
  }
  revalidatePath('/superadmin/toppings');
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
            for(const child of children.docs)await authorizeLocationCatalog(tx,identity,child.data(),'orderfly.catalog:delete');
            for(const child of children.docs)tx.delete(child.ref);
            tx.delete(ref);
        });

        revalidatePath("/superadmin/toppings");
        return { message: "Topping group and its toppings deleted successfully.", error: false };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete topping group: ${errorMessage}`, error: true };
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
      return {...before,...toppingData,id:toppingId};
    });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save topping: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/toppings');
  redirect('/superadmin/toppings');
}

export async function deleteTopping(toppingId: string) {
    try {
        await mutateLocationCatalog('toppings',toppingId,'orderfly.catalog:delete',()=>null);
        revalidatePath("/superadmin/toppings");
        return { message: "Topping deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete topping: ${errorMessage}`, error: true };
    }
}

export async function updateToppingSortOrder(orderedToppings: {id: string, sortOrder: number}[]) {
    try {
        await reorderLocationCatalog('toppings',orderedToppings);
        revalidatePath('/superadmin/toppings');
        return { message: 'Topping order updated.', error: false };
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to update topping order: ${errorMessage}`, error: true };
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
  return rows.docs.map(doc=>{const d=doc.data();return {id:doc.id,locationIds:[locationId],groupName:d.groupName,minSelection:d.minSelection,maxSelection:d.maxSelection} as ToppingGroup;}).sort((a,b)=>a.groupName.localeCompare(b.groupName));
}
export async function getToppingGroupById(id:string):Promise<ToppingGroup|null>{return await getLocationCatalogDocument('topping_groups',id) as ToppingGroup|null;}
export async function getToppings(locationId?: string): Promise<Topping[]> {
  if(!locationId)return (await listLocationCatalog('toppings') as Topping[]).sort((a,b)=>a.toppingName.localeCompare(b.toppingName));
  if(!await publicLocation(locationId))return [];
  const rows=await getAdminDb().collection('toppings').where('locationIds','array-contains',locationId).where('isActive','==',true).get();
  return rows.docs.map(doc=>{const d=doc.data();return {id:doc.id,locationIds:[locationId],groupId:d.groupId,toppingName:d.toppingName,price:d.price,isActive:true,isDefault:d.isDefault===true,sortOrder:d.sortOrder} as Topping;}).sort((a,b)=>(a.sortOrder??999)-(b.sortOrder??999));
}
export async function getToppingById(id:string):Promise<Topping|null>{return await getLocationCatalogDocument('toppings',id) as Topping|null;}
