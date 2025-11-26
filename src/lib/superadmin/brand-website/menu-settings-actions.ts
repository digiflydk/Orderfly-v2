
'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import type { BrandWebsiteMenuSettings, BrandWebsiteMenuHero } from '@/types';
import {
  brandWebsiteMenuSettingsSchema,
  brandWebsiteMenuHeroSchema,
  type BrandWebsiteMenuHeroInput,
  type BrandWebsiteMenuSettingsInput,
} from './menu-settings-schemas';
import type { ZodSchema } from 'zod';
import { z } from 'zod';
import { logBrandWebsiteAuditEntry } from './brand-website-audit';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';

function serializeTimestamp(value: any): string | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  return value as any;
}

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
    updatedAt: serializeTimestamp(data.updatedAt),
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
  const start = Date.now();
  const action = 'getBrandWebsiteMenuSettings';
  try {
    await requireSuperadmin();
    const result = await readMenuSettings(brandId);
     await logBrandWebsiteApiCall({
        layer: 'cms', action, brandId, status: 'success', durationMs: Date.now() - start, path: menuSettingsPath(brandId)
    });
    return result;
  } catch(error: any) {
     await logBrandWebsiteApiCall({
        layer: 'cms', action, brandId, status: 'error', durationMs: Date.now() - start, path: menuSettingsPath(brandId), errorMessage: error?.message ?? 'Unknown error'
    });
    throw error;
  }
}

export async function saveBrandWebsiteMenuSettings(
  brandId: string,
  input: BrandWebsiteMenuSettingsInput
): Promise<BrandWebsiteMenuSettings> {
    const start = Date.now();
    const actionName = 'saveBrandWebsiteMenuSettings';
    try {
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

         await logBrandWebsiteApiCall({
            layer: 'cms', action: actionName, brandId, status: 'success', durationMs: Date.now() - start, path: menuSettingsPath(brandId)
        });

        return result;
    } catch (error: any) {
        await logBrandWebsiteApiCall({
            layer: 'cms', action: actionName, brandId, status: 'error', durationMs: Date.now() - start, path: menuSettingsPath(brandId), errorMessage: error?.message ?? 'Unknown error'
        });
        throw error;
    }
}

export async function saveBrandWebsiteMenuHero(
  brandId: string,
  hero: BrandWebsiteMenuHeroInput | null
): Promise<BrandWebsiteMenuSettings> {
    const start = Date.now();
    const actionName = 'saveBrandWebsiteMenuHero';
    try {
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

        await logBrandWebsiteApiCall({
            layer: 'cms', action: actionName, brandId, status: 'success', durationMs: Date.now() - start, path: menuSettingsPath(brandId)
        });

        return result;
    } catch(error: any) {
        await logBrandWebsiteApiCall({
            layer: 'cms', action: actionName, brandId, status: 'error', durationMs: Date.now() - start, path: menuSettingsPath(brandId), errorMessage: error?.message ?? 'Unknown error'
        });
        throw error;
    }
}
