"use client";
import type { M3MenuItem } from "../_data/mock";

export default function MenuList({ items }: { items: M3MenuItem[] }) {
  return (
    <ul className="divide-y divide-neutral-200 border border-neutral-200 rounded">
      {items.map((item) => (
        <li key={item.id} className="p-3 flex items-center justify-between">
          <div>
            <div className="font-medium">{item.name}</div>
            {item.description && (
              <div className="text-sm text-neutral-600">{item.description}</div>
            )}
          </div>
          <div className="font-semibold tabular-nums">{item.priceDkk} kr.</div>
        </li>
      ))}
    </ul>
  );
}
