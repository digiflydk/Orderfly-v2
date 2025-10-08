
// src/components/catalog/product-card.tsx
"use client";

import { getDisplayName, getDisplayPrice, formatDKK } from "@/lib/catalog-display";

export default function ProductCard({ product }: { product: any }) {
  const name = getDisplayName(product);
  const price = getDisplayPrice(product);
  return (
    <div className="rounded border p-4">
      <div className="font-medium">
        {name || <span className="opacity-60 italic">Uden navn</span>}
      </div>
      {price !== null ? (
        <div className="opacity-80 mt-1">{formatDKK(price)}</div>
      ) : null}
    </div>
  );
}
