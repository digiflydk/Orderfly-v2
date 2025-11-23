
'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import type { BrandWebsiteMenuSettings, BrandWebsiteMenuHero } from '@/lib/types/brandWebsite';
import {
  brandWebsiteMenuSettingsSchema,
  brandWebsiteMenuHeroSchema,
  type BrandWebsiteMenuHeroInput,
  type BrandWebsiteMenuSettingsInput,
} from './menu-settings-schemas';
import type { ZodSchema } from 'zod';
import { z } from 'zod';
import { logBrandWebsiteAuditEntry } from './brand-website-audit';

const menuSettingsPath = (brandId: string) => `/brands/${brandId}/website/menuSettings`;

const VIRTUAL_MENU_SETTINGS: BrandWebsiteMenuSettings = {
  hero: null,
  gridLayout: 3,
  showPrice: true,
  showDescription: true,
  stickyCategories: true,
  defaultLocationId: null,
  updatedAt: null,
};

async function readMenuSettings(brandId: string): Promise<BrandWebsiteMenuSettings> {
  const db = getAdminDb();
  const docRef = db.doc(menuSettingsPath(brandId));
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return VIRTUAL_MENU_SETTINGS;
  }
  
  const data = docSnap.data() ?? {};
  const merged = { ...VIRTUAL_MENU_SETTINGS, ...data };
  
  const validated = brandWebsiteMenuSettingsSchema.parse(merged);
  
  return {
    ...validated,
    updatedAt: data.updatedAt || null,
  } as BrandWebsiteMenuSettings;
}

async function writeMenuSettings(
  brandId: string,
  data: Partial<BrandWebsiteMenuSettings>
): Promise<BrandWebsiteMenuSettings> {
  const db = getAdminDb();
  const docRef = db.doc(menuSettingsPath(brandId));

  const updatedData = {
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await docRef.set(updatedData, { merge: true });
  return readMenuSettings(brandId);
}

export async function getBrandWebsiteMenuSettings(
  brandId: string
): Promise<BrandWebsiteMenuSettings> {
  await requireSuperadmin();
  return readMenuSettings(brandId);
}

export async function saveBrandWebsiteMenuSettings(
  brandId: string,
  input: BrandWebsiteMenuSettingsInput
): Promise<BrandWebsiteMenuSettings> {
  await requireSuperadmin();
  const validatedInput = brandWebsiteMenuSettingsSchema.parse(input);
  const currentSettings = await readMenuSettings(brandId);
  const newSettings = {
    ...currentSettings,
    ...validatedInput,
  };
  const result = await writeMenuSettings(brandId, newSettings);

  await logBrandWebsiteAuditEntry({
    brandId,
    entity: 'menuSettings',
    entityId: 'menuSettings',
    action: 'update',
    changedFields: ['settings'],
    path: menuSettingsPath(brandId),
  });

  return result;
}

export async function saveBrandWebsiteMenuHero(
  brandId: string,
  hero: BrandWebsiteMenuHeroInput | null
): Promise<BrandWebsiteMenuSettings> {
  await requireSuperadmin();

  let validatedHero: BrandWebsiteMenuHero | null = null;
  if (hero) {
    validatedHero = brandWebsiteMenuHeroSchema.parse(hero);
  }

  const currentSettings = await readMenuSettings(brandId);
  const newSettings = {
    ...currentSettings,
    hero: validatedHero,
  };

  const result = await writeMenuSettings(brandId, newSettings);

  await logBrandWebsiteAuditEntry({
    brandId,
    entity: 'menuSettings',
    entityId: 'menuSettings',
    action: 'update',
    changedFields: ['hero'],
    path: menuSettingsPath(brandId),
  });

  return result;
}
