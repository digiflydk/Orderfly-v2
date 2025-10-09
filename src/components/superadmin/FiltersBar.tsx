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
  filters?: SACommonFilters
  onChange?: (next: SACommonFilters) => void
  brands?: Brand[]
  locations?: Location[]
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
  const safeFilters: SACommonFilters = {
    dateFrom: filters?.dateFrom ?? todayStr(),
    dateTo: filters?.dateTo ?? todayStr(),
    brandId: filters?.brandId ?? 'all',
    locationIds: filters?.locationIds ?? undefined,
  }

  const [query, setQuery] = useState('')

  const emit = (partial: Partial<SACommonFilters>) => {
    const next: SACommonFilters = {
      dateFrom: partial.dateFrom ?? safeFilters.dateFrom,
      dateTo: partial.dateTo ?? safeFilters.dateTo,
      brandId: partial.brandId ?? safeFilters.brandId,
      locationIds: partial.locationIds ?? safeFilters.locationIds,
    }
    onChange?.(next)
  }

  const onDateFrom = (v: string) => {
    // guard: from må ikke være efter to
    const to = safeFilters.dateTo
    emit({ dateFrom: v > to ? to : v })
  }
  const onDateTo = (v: string) => {
    const from = safeFilters.dateFrom
    emit({ dateTo: v < from ? from : v })
  }

  const visibleBrands = useMemo(() => {
    const q = query.toLowerCase()
    const filtered = q ? brands.filter(b => b.name?.toLowerCase().includes(q)) : brands
    return filtered
  }, [brands, query])

  const visibleLocations = useMemo(() => {
    if (hideLocations) return []
    const q = query.toLowerCase()
    const list =
      safeFilters.brandId === 'all'
        ? locations
        : locations.filter(l => l.brandId === safeFilters.brandId)
    return q ? list.filter(l => l.name?.toLowerCase().includes(q)) : list
  }, [locations, safeFilters.brandId, hideLocations, query])

  const toggleLocation = (id: string) => {
    const current = safeFilters.locationIds ?? []
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    emit({ locationIds: next.length ? next : undefined })
  }

  return (
    <div className={cn('w-full rounded-md border bg-card', className)}>
      <Command>
        {/* Top row: søg + datoer */}
        <div className="flex flex-col gap-2 border-b p-3 md:flex-row md:items-center md:justify-between">
          <div className="md:max-w-sm">
            <CommandInput
              placeholder="Search filters…"
              value={query}
              onValueChange={setQuery}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="text-muted-foreground">From</label>
            <input
              type="date"
              className="h-9 rounded-md border bg-background px-2"
              value={safeFilters.dateFrom}
              max={safeFilters.dateTo}
              onChange={(e) => onDateFrom(e.target.value)}
            />
            <label className="ml-2 text-muted-foreground">To</label>
            <input
              type="date"
              className="h-9 rounded-md border bg-background px-2"
              value={safeFilters.dateTo}
              min={safeFilters.dateFrom}
              onChange={(e) => onDateTo(e.target.value)}
            />
          </div>
        </div>

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
              <div className="px-3 py-2 text-sm text-muted-foreground">Ingen brands</div>
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
