

'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireOrderflyAccess } from '@/lib/access/orderfly-session';
import { getScopedDocument, listScopedDocuments, mutateScopedDocument } from '@/lib/access/scoped-data';
import { Timestamp } from 'firebase-admin/firestore';
import type { Discount } from '@/types';
import { z, type ZodIssue } from 'zod';
import { redirect } from 'next/navigation';
import { marketingConfigurationStatus } from '@/lib/marketing/config';
import { savedPromotionDate } from '@/lib/promotion-calendar';
import { promotionDate } from '@/lib/promotion-date';

const activeTimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const discountSchema = z.object({
  id: z.string().optional(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).min(1, 'At least one location must be selected.'),
  applicationType: z.enum(['code', 'newsletter_signup']).default('code'),
  code: z.string().transform(v => v.trim().toUpperCase()),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed_amount']),
  discountValue: z.coerce.number({ invalid_type_error: 'Indtast et gyldigt tal.' }).finite('Indtast et endeligt tal.').positive('Rabatten skal være større end 0.'),
  minOrderValue: z.coerce.number().min(0).optional(),
  isActive: z.boolean().default(true),
  orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
  activeDays: z.array(z.string()).optional().default([]),
  activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  usageLimit: z.coerce.number().min(0, 'Usage limit must be 0 or more.'),
  perCustomerLimit: z.coerce.number().min(0, 'Per customer limit must be 0 or more.'),
  assignedToCustomerId: z.string().optional(),
  firstTimeCustomerOnly: z.boolean().default(false),
  allowStacking: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.discountType === 'percentage' && data.discountValue > 100) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Procentrabatten må højst være 100 %.' });
  if (data.applicationType === 'code' && data.code === 'NEWSLETTER_SIGNUP') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['code'], message: 'Indtast en rabatkode. NEWSLETTER_SIGNUP er reserveret til nyhedsbrevsrabatter.' });
  }
  if (data.applicationType === 'code' && data.code.length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['code'],
      message: 'Code must be at least 3 characters.',
    });
  }
});

export type FormState = {
  message: string;
  error: boolean;
  errors?: z.ZodIssue[];
};

export async function createOrUpdateDiscount(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  try {
    const id = formData.get('id') as string | null;

    const rawData = {
        brandId: formData.get('brandId'),
        locationIds: formData.getAll('locationIds'),
        applicationType: formData.get('applicationType') || 'code',
        code: formData.get('applicationType') === 'newsletter_signup'
          ? 'NEWSLETTER_SIGNUP'
          : formData.get('code'),
        description: formData.get('description') === null ? undefined : String(formData.get('description')),
        discountType: formData.get('discountType'),
        discountValue: formData.get('discountValue'),
        minOrderValue: formData.get('minOrderValue') || undefined,
        isActive: formData.get('isActive') === 'true' || formData.get('isActive') === 'on',
        orderTypes: formData.getAll('orderTypes'),
        activeDays: formData.getAll('activeDays'),
        startDate: formData.get('startDate') || undefined,
        endDate: formData.get('endDate') || undefined,
        usageLimit: formData.get('usageLimit'),
        perCustomerLimit: formData.get('perCustomerLimit'),
        assignedToCustomerId: formData.get('assignedToCustomerId') || undefined,
        firstTimeCustomerOnly: formData.get('firstTimeCustomerOnly') === 'true' || formData.get('firstTimeCustomerOnly') === 'on',
        allowStacking: formData.get('allowStacking') === 'true' || formData.get('allowStacking') === 'on',
        activeTimeSlots: JSON.parse((formData.get('activeTimeSlots') as string | null) || '[]'),
    };
    
    if (id) (rawData as any).id = id;
    
    const validatedFields = discountSchema.safeParse(rawData);
    
    if (!validatedFields.success) {
      console.error('Validation errors:', validatedFields.error.flatten());
      return {
        message: 'Validation failed. Please check the fields below for errors.',
        error: true,
        errors: validatedFields.error.issues,
      };
    }
    
    const { id: validatedId, ...discountData } = validatedFields.data;

    const permission = `orderfly.discounts:${validatedId ? 'edit' : 'create'}`;
    if (!validatedId) await requireOrderflyAccess(discountData.brandId, discountData.locationIds, permission);
    const db = getAdminDb();
    const docId = validatedId || db.collection('discounts').doc().id;

    const dataToSave: any = {
        id: docId,
        ...discountData,
        assignedToCustomerId: discountData.assignedToCustomerId || null,
        startDate: formData.get('clearStartDate') === 'true' ? null : undefined,
        endDate: formData.get('clearEndDate') === 'true' ? null : undefined,
        updatedAt: Timestamp.now(),
        usedCount: 0,
    };
    
    if (!id) {
      dataToSave.createdAt = Timestamp.now();
    }
    
    // Remove undefined fields to prevent Firestore errors
    Object.keys(dataToSave).forEach(key => dataToSave[key] === undefined && delete dataToSave[key]);

    await mutateScopedDocument('discounts', docId, permission, 'locations', async (before, tx) => {
      if (before && before.brandId !== discountData.brandId) throw new Error('A discount cannot move to another brand.');
      if (discountData.assignedToCustomerId) {
        const customer = await tx.get(db.collection('customers').doc(discountData.assignedToCustomerId));
        if (!customer.exists || customer.data()?.brandId !== discountData.brandId) throw new Error('Select a customer belonging to this brand.');
      }
      if (discountData.startDate) dataToSave.startDate = Timestamp.fromDate(savedPromotionDate(discountData.startDate, before?.startDate));
      if (discountData.endDate) dataToSave.endDate = Timestamp.fromDate(savedPromotionDate(discountData.endDate, before?.endDate, true));
      if (dataToSave.startDate && dataToSave.endDate && dataToSave.startDate.toDate() > dataToSave.endDate.toDate()) throw new Error('Slutdatoen skal være på eller efter startdatoen.');
      const duplicates = await tx.get(db.collection('discounts').where('brandId', '==', discountData.brandId).where('code', '==', discountData.code));
      if (discountData.applicationType === 'code' && duplicates.docs.some(record => record.id !== docId)) throw new Error('Denne rabatkode findes allerede for brandet.');
      const changedType = before && (before.applicationType || 'code') !== discountData.applicationType;
      return { ...before, ...dataToSave, usedCount: before?.usedCount ?? 0,
        ...(changedType ? { applicationHistory: [...(Array.isArray(before.applicationHistory) ? before.applicationHistory : []), { applicationType: before.applicationType || 'code', code: before.code, changedAt: dataToSave.updatedAt }] } : {}),
      };
    }, true);

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    console.error('Error in createOrUpdateDiscount:', e);
    return { message: `Failed to save discount: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/discounts');
  redirect('/superadmin/discounts');
}

export async function deleteDiscount(id: string) {
    try {
        await mutateScopedDocument('discounts', id, 'orderfly.discounts:delete', 'locations', before => {
          if (before!.usedCount > 0) throw new Error('Cannot delete a discount that has been used. Please deactivate it instead.');
          return null;
        }, true);
        revalidatePath("/superadmin/discounts");
        return { message: "Discount deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete discount: ${errorMessage}`, error: true };
    }
}

export async function getDiscounts(): Promise<Discount[]> {
  const documents = await listScopedDocuments('discounts', 'orderfly.discounts:view', 'locations');
  return documents.sort((a, b) => String(a.data().code).localeCompare(String(b.data().code))).map(doc => {
    const data = doc.data();
    return { 
      ...data,
      id: doc.id,
      startDate: promotionDate(data.startDate),
      endDate: promotionDate(data.endDate),
      createdAt: promotionDate(data.createdAt) ?? null,
      updatedAt: promotionDate(data.updatedAt) ?? null,
    } as Discount;
  });
}

export async function getDiscountById(id: string): Promise<Discount | null> {
    const docSnap = await getScopedDocument('discounts', id, 'orderfly.discounts:view', 'locations', true);
    if (docSnap) {
        const data = docSnap.data()!;
        return { 
            ...data,
            id: docSnap.id,
            startDate: promotionDate(data.startDate),
            endDate: promotionDate(data.endDate),
            createdAt: promotionDate(data.createdAt) ?? null,
            updatedAt: promotionDate(data.updatedAt) ?? null,
        } as Discount;
    }
    return null;
}

export async function getDiscountCustomers(brandId: string): Promise<{id: string; name: string; email: string}[]> {
  if (!brandId) return [];
  await requireOrderflyAccess(brandId, null, 'orderfly.discounts:view');
  const snapshot = await getAdminDb().collection('customers').where('brandId', '==', brandId).get();
  return snapshot.docs.map(d => ({ id: d.id, name: d.data().fullName || '', email: d.data().email || '' }));
}

/** Redacted readiness only; this never contacts the provider or records consent. */
export async function getNewsletterSetup(brandId: string): Promise<string | null> {
  await requireOrderflyAccess(brandId, null, 'orderfly.discounts:view');
  const { reason } = marketingConfigurationStatus(brandId);
  const messages = {
    secret_unavailable: 'Nyhedsbrevstjenestens konfiguration mangler på serveren.',
    invalid_mapping: 'Nyhedsbrevstjenestens konfiguration er ugyldig.',
    duplicate_mapping: 'Brandet er tilknyttet flere gange i nyhedsbrevskonfigurationen.',
    brand_not_mapped: 'Brandet er ikke tilknyttet nyhedsbrevstjenesten.',
    brand_disabled: 'Nyhedsbrevstjenesten er deaktiveret for brandet.',
  };
  return reason ? `${messages[reason]} Kampagnen kan gemmes, men tilbydes ikke i checkout, før opsætningen er rettet.` : null;
}
