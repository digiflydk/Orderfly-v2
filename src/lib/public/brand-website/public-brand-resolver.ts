'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';

/**
 * Resolves a brand ID from a given domain name by checking the `domains` array
 * in the brand's website configuration.
 *
 * @param domain The domain name to resolve.
 * @returns The brand ID if a match is found, otherwise null.
 */
export async function resolveBrandByDomain(domain: string): Promise<string | null> {
  if (!domain) {
    return null;
  }

  const db = getAdminDb();
  try {
    const brandsRef = db.collection('brands');
    const snapshot = await brandsRef.get();

    for (const doc of snapshot.docs) {
      const configPath = `brands/${doc.id}/website/config`;
      const configDoc = await db.doc(configPath).get();
      
      if (configDoc.exists) {
        const config = configDoc.data() as Partial<BrandWebsiteConfig>;
        if (config.domains && config.domains.includes(domain)) {
          return doc.id;
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`[public-brand-resolver] Error resolving domain "${domain}":`, error);
    return null; // Never throw for unknown domains.
  }
}
