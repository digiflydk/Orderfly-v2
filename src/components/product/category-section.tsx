
'use client';

import type { Category, ProductForMenu, StandardDiscount } from '@/types';
import { ProductCard, ProductCardSkeleton } from "@/components/product/product-card";

interface CategorySectionProps {
  category: Category;
  brandId: string;
  locationId: string;
  products: ProductForMenu[]; // Products are now passed as props
  activeDiscounts: StandardDiscount[];
  categoryRef: (el: HTMLDivElement | null) => void;
}

export function CategorySection({ category, products, activeDiscounts, categoryRef }: CategorySectionProps) {
  
  if (products.length === 0) {
    return null;
  }

  return (
    <div id={`category-${category.id}`} ref={categoryRef} className="space-y-6 scroll-mt-24">
      <div>
        <h2 className="text-2xl font-bold">{category.categoryName}</h2>
        {category.description && (
          <p className="text-muted-foreground mt-1">{category.description}</p>
        )}
      </div>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
          {products.map(product => (
            <ProductCard
                key={product.id}
                product={product}
                activeDiscounts={activeDiscounts}
            />
          ))}
      </div>
    </div>
  );
}
