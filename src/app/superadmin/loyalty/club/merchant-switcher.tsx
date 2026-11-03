'use client';

import { useRouter } from 'next/navigation';

export function MerchantSwitcher({ current, brands }: { current: string; brands: Array<{ brandId: string; brandName: string }> }) {
  const router = useRouter();
  return <label className="flex flex-col gap-1 text-sm text-muted-foreground">
    Skift merchant
    <select value={current} onChange={event => router.push(`/superadmin/loyalty/club/${encodeURIComponent(event.target.value)}`)}
      className="min-h-11 min-w-56 rounded-md border bg-background px-3 text-sm text-foreground">
      {brands.map(brand => <option key={brand.brandId} value={brand.brandId}>{brand.brandName}</option>)}
    </select>
  </label>;
}
