"use client";

import { useMemo, useState } from "react";
import CategoryTabs from "@/components/catalog/category-tabs";
import ProductCard from "@/components/catalog/product-card";

type Menu = {
  categories: Array<{ id: string; name: string }>;
  productsByCategory: Record<string, any[]>;
  fallbackUsed?: boolean;
};

export default function ProductGrid({ menu }: { menu: Menu }) {
  const categories = menu.categories ?? [];

  // map counts
  const categoriesWithCounts = useMemo(
    () =>
      categories.map((c) => ({
        ...c,
        productCount: (menu.productsByCategory[c.id] ?? []).length,
      })),
    [categories, menu.productsByCategory]
  );

  const defaultCatId = categoriesWithCounts[0]?.id;
  const [activeId, setActiveId] = useState<string | undefined>(defaultCatId);

  const products = useMemo(
    () => (activeId ? menu.productsByCategory[activeId] ?? [] : []),
    [activeId, menu.productsByCategory]
  );

  return (
    <div>
      <CategoryTabs
        categories={categoriesWithCounts}
        activeId={activeId}
        onSelect={(id) => setActiveId(id)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {products.map((p: any) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      {menu.fallbackUsed ? (
        <p className="text-sm opacity-70 mt-4">
          Viser fallback “Menu”, fordi ingen kategorier fandtes.
        </p>
      ) : null}
    </div>
  );
}
