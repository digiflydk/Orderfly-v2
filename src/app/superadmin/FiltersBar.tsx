'use client';

import * as React from 'react';

type Option = { id: string; name: string };

/**
 * Minimal stub af FiltersBar.
 * Bruges kun for at undgå "module not found".
 * Udskift med din rigtige komponent, når du er klar.
 */
export function FiltersBar(props: {
  brands?: Option[];
  locations?: Option[];
  defaultFilters?: Record<string, unknown>;
  onChange?: (filters: Record<string, unknown>) => void;
}) {
  const { brands = [], locations = [], defaultFilters = {}, onChange } = props;

  const [filters, setFilters] = React.useState<Record<string, unknown>>(
    defaultFilters
  );

  function handleChange(key: string, value: unknown) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    onChange?.(next);
  }

  return (
    <div className="mb-4 rounded-lg border bg-white p-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="h-9 rounded-md border px-2"
          onChange={(e) => handleChange('brandId', e.target.value || null)}
          defaultValue={(filters['brandId'] as string) ?? ''}
        >
          <option value="">Alle brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <select
          className="h-9 rounded-md border px-2"
          onChange={(e) => handleChange('locationId', e.target.value || null)}
          defaultValue={(filters['locationId'] as string) ?? ''}
        >
          <option value="">Alle lokationer</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        <button
          className="h-9 rounded-md border px-3 text-sm"
          onClick={() => {
            setFilters({});
            onChange?.({});
          }}
        >
          Nulstil
        </button>
      </div>
    </div>
  );
}
