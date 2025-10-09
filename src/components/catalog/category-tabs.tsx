"use client";
import React, { useState } from "react";

interface Category {
  id: string;
  name: string;
  productCount: number;
}

export default function CategoryTabs({
  categories,
  activeId,
  onSelect,
}: {
  categories: Category[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  const [selected, setSelected] = useState(activeId || categories[0]?.id);

  return (
    <div className="flex gap-2 overflow-x-auto py-2 mb-3 border-b border-gray-200">
      {categories.map((cat) => {
        const isActive = selected === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => {
              setSelected(cat.id);
              onSelect(cat.id);
            }}
            className={`px-4 py-1 rounded-full text-sm font-medium transition ${
              isActive
                ? "bg-black text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {cat.name}
            <span className="ml-1 text-xs opacity-70">
              ({cat.productCount})
            </span>
          </button>
        );
      })}
    </div>
  );
}
