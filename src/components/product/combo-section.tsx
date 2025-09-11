
'use client';

import type { ComboMenu, Brand, Location, ProductForMenu } from '@/types';
import { ComboCard } from "@/components/product/combo-card";

interface ComboSectionProps {
  combos: ComboMenu[];
  brand: Brand;
  location: Location;
  comboProducts: ProductForMenu[]; // Receive combo products as props
  categoryRef: (el: HTMLDivElement | null) => void;
}

export function ComboSection({ combos, brand, comboProducts, categoryRef }: ComboSectionProps) {
  
  if (combos.length === 0) {
    return null;
  }

  return (
    <div id="category-combos" ref={categoryRef} className="space-y-6 scroll-mt-24">
      <div>
        <h2 className="text-2xl font-bold">{brand.combosHeading || 'Combo Deals'}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {combos.map(combo => (
          <ComboCard
            key={combo.id}
            combo={combo}
            brandProducts={comboProducts}
          />
        ))}
      </div>
    </div>
  );
}
