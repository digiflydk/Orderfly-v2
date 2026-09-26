'use client'

import * as React from 'react'
import { AdminSelectField } from '@/components/superadmin/admin-select-field'
import { Button } from '@/components/ui/button'

type Option = { id: string; name: string }
type LocationOption = Option & { brandId: string }

interface FiltersBarProps {
  brands?: Option[]
  locations?: LocationOption[]
  defaultFilters?: Record<string, unknown>
  onChange?: (filters: Record<string, unknown>) => void
}

export default function FiltersBar(props: FiltersBarProps) {
  const { brands = [], locations = [], defaultFilters = {}, onChange } = props

  const [filters, setFilters] = React.useState<Record<string, unknown>>(
    defaultFilters
  )

  function handleChange(key: string, value: unknown) {
    const next = key === 'brandId'
      ? { ...filters, brandId: value, locationId: null }
      : { ...filters, [key]: value }
    setFilters(next)
    onChange?.(next)
  }

  return (
    <div className="admin-filter-bar mb-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        {/* Brand selector */}
        <AdminSelectField label="Brand"
          onChange={(e) => handleChange('brandId', e.target.value || null)}
          value={(filters['brandId'] as string) ?? ''}
        >
          <option value="">Alle brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </AdminSelectField>

        {/* Location selector */}
        <AdminSelectField label="Lokation"
          onChange={(e) => handleChange('locationId', e.target.value || null)}
          value={(filters['locationId'] as string) ?? ''}
        >
          <option value="">Alle lokationer</option>
          {locations.filter(l => !filters.brandId || l.brandId === filters.brandId).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </AdminSelectField>

        {/* Reset button */}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setFilters({})
            onChange?.({})
          }}
        >
          Nulstil
        </Button>
      </div>
    </div>
  )
}
