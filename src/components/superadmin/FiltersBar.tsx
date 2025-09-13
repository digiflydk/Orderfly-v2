'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
  CommandSeparator,
} from '@/components/ui/command'
import type { SACommonFilters } from '@/types/superadmin'

type Brand = { id: string; name: string }
type Location = { id: string; name: string; brandId: string }

type FiltersBarProps = {
  className?: string
  /** Aktuelle filtre (kontrolleret) */
  filters?: SACommonFilters
  /** Kald når filtre ændres */
  onChange?: (next: SACommonFilters) => void
  /** Datakilder */
  brands?: Brand[]
  locations?: Location[]
  /** Skjul locations-sektion */
  hideLocations?: boolean
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export function FiltersBar({
  className,
  filters,
  onChange,
  brands = [],
  locations = [],
  hideLocations = false,
}: FiltersBarProps) {
  // Sikker defaults
  const safeFilters: SACommonFilters = {
    dateFrom: filters?.dateFrom ?? todayStr(),
    dateTo: filters?.dateTo ?? todayStr(),
    brandId: filters?.brandId ?? 'all',
    locationIds: filters?.locationIds ?? undefined,
  }

  const [query, setQuery] = useState('')

  // Brand-liste (med "All brands" først) og søgning
  const visibleBrands = useMemo(() => {
    const q = query.toLowerCase()
    const filtered = q
      ? brands.filter((b) => b.name?.toLowerCase().includes(q))
      : brands
    return filtered
  }, [brands, query])

  // Location-liste filtreret efter brand + søgning
  const visibleLocations = useMemo(() => {
    if (hideLocations) return []
    const q = query.toLowerCase()
    const list =
      safeFilters.brandId === 'all'
        ? locations
        : locations.filter((l) => l.brandId === safeFilters.brandId)
    return q ? list.filter((l) => l.name?.toLowerCase().includes(q)) : list
  }, [locations, safeFilters.brandId, hideLocations, query])

  const emit = (partial: Partial<SACommonFilters>) => {
    const next: SACommonFilters = {
      dateFrom: partial.dateFrom ?? safeFilters.dateFrom,
      dateTo: partial.dateTo ?? safeFilters.dateTo,
      brandId: partial.brandId ?? safeFilters.brandId,
      locationIds: partial.locationIds ?? safeFilters.locationIds,
    }
    onChange?.(next)
  }

  const toggleLocation = (id: string) => {
    const current = safeFilters.locationIds ?? []
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id]
    emit({ locationIds: next.length ? next : undefined })
  }

  return (
    <div className={cn('w-full rounded-md border bg-card', className)}>
      <Command>
        <CommandInput
          placeholder="Search filters…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>Ingen matches…</CommandEmpty>

          {/* Brand */}
          <CommandGroup heading="Brand">
            <CommandItem onSelect={() => emit({ brandId: 'all' })}>
              <span className={cn(safeFilters.brandId === 'all' && 'font-semibold')}>
                All brands
              </span>
            </CommandItem>

            {visibleBrands.map((b) => (
              <CommandItem key={b.id} onSelect={() => emit({ brandId: b.id })}>
                <span className={cn(safeFilters.brandId === b.id && 'font-semibold')}>
                  {b.name ?? b.id}
                </span>
              </CommandItem>
            ))}
            {!visibleBrands.length && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Ingen brands
              </div>
            )}
          </CommandGroup>

          {/* Locations */}
          {!hideLocations && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Locations">
                {visibleLocations.map((l) => (
                  <CommandItem key={l.id} onSelect={() => toggleLocation(l.id)}>
                    <span
                      className={cn(
                        safeFilters.locationIds?.includes(l.id) && 'font-semibold'
                      )}
                    >
                      {l.name}
                    </span>
                  </CommandItem>
                ))}
                {!visibleLocations.length && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Ingen locations for valgt brand
                  </div>
                )}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </div>
  )
}
