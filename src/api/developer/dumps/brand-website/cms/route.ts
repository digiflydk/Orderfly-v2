
import 'server-only';
import { NextResponse } from 'next/server';
import { requireSuperadminApi } from '@/lib/auth/superadmin-api';
import { getAdminDb } from '@/lib/firebase-admin';

async function getBrandWebsiteData(brandId: string) {
    const db = getAdminDb();
    const basePath = `brands/${brandId}/website`;
    const [configSnap, homeSnap, pagesSnap, menuSettingsSnap] = await Promise.all([
        db.doc(`${basePath}/config`).get(),
        db.doc(`${basePath}/home`).get(),
        db.collection(`${basePath}/pages`).get(),
        db.doc(`${basePath}/menuSettings`).get(),
    ]);

    const pages = pagesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return {
        config: configSnap.exists ? configSnap.data() : null,
        home: homeSnap.exists ? homeSnap.data() : null,
        pages: pages,
        menuSettings: menuSettingsSnap.exists ? menuSettingsSnap.data() : null,
    };
}

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  const db = getAdminDb();
  const brandsSnap = await db.collection('brands').get();
  
  const allData: Record<string, any> = {};

  for (const brandDoc of brandsSnap.docs) {
      allData[brandDoc.id] = await getBrandWebsiteData(brandDoc.id);
  }

  const body = JSON.stringify({ data: allData, timestamp: new Date().toISOString() }, null, 2);
  const filename = "brand-website-cms-dump.json";

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
