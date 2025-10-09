
"use client";

import { getDisplayName, getDisplayPrice, getDisplayDescription, formatDKK } from "@/lib/catalog-display";

export default function ProductCard({ product }: { product: any }) {
  const name = getDisplayName(product);
  const price = getDisplayPrice(product);
  const desc = getDisplayDescription(product);

  return (
    <div className="relative border rounded-lg p-3 bg-white shadow-sm hover:shadow-md transition">
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {price !== null ? (
          <span className="text-xs bg-gray-800 text-white px-2 py-0.5 rounded">
            {formatDKK(price)}
          </span>
        ) : null}
        <button
          type="button"
          className="text-xs bg-black text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-gray-800"
          aria-label="Tilføj"
        >
          +
        </button>
      </div>

      <h3 className="font-semibold text-gray-900">
        {name || <span className="opacity-60 italic">Uden navn</span>}
      </h3>

      {desc ? <p className="text-xs text-gray-500 mt-1">{desc}</p> : null}
    </div>
  );
}
