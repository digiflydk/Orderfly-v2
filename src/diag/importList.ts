
// This list contains modules that are suspected of causing server-side errors
// during the Next.js build or render process. The diagnostic API will
// attempt to import each of these to pinpoint the exact failure point.
export const IMPORT_SWEEP_LIST = [
  '@/app/layout.tsx',
  '@/app/providers.tsx',
  '@/components/layout/header.tsx',
  '@/components/layout/footer.tsx',
  '@/lib/firebase/admin.ts',
  '@/lib/firebase.ts',
  '@/app/superadmin/layout.tsx',
  '@/app/superadmin/dashboard/page.tsx',
  '@/app/[brandSlug]/page.tsx',
  '@/app/[brandSlug]/layout.tsx',
];
