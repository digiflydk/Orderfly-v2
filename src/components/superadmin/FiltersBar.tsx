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

type Location = { id: string; name: string; brandId: string }

type FiltersBarProps = {
  className?: string
  filters?: SACommonFilters
  onChange?: (next: SACommonFilters) => void
  locations?: Location[]
  hideLocations?: boolean
}

const todayStr = () => new Date().toISOString().slice(0, 10)

export function FiltersBar({
  className,
  filters,
  onChange,
  locations = [],
  hideLocations = false,
}: FiltersBarProps) {
  // 🔒 Sikkerhed: lav et "safeFilters" objekt med defaults
  const safeFilters: SACommonFilters = {
    dateFrom: filters?.dateFrom ?? todayStr(),
    dateTo: filters?.dateTo ?? todayStr(),
    brandId: filters?.brandId ?? 'all',
    locationIds: filters?.locationIds ?? undefined,
  }

  const [query, setQuery] = useState('')

  // Filtrer locations ift. brand
  const visibleLocations = useMemo(() => {
    if (hideLocations) return []
    if (!locations?.length) return []
    if (safeFilters.brandId === 'all') return locations
    return locations.filter((l) => l.brandId === safeFilters.brandId)
    // brug safeFilters.brandId i deps, ikke filters.brandId
  }, [locations, safeFilters.brandId, hideLocations])

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
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    emit({ locationIds: next.length ? next : undefined })
  }

  const onSearchChange = (val: string) => {
    setQuery(val)
    // hvis du vil binde søgning til noget i URL/filters, kan du udvide her
  }

  const normalizedQuery = query.toLowerCase()

  return (
    <div className={cn('w-full rounded-md border bg-card', className)}>
      <Command>
        <CommandInput placeholder="Search filters…" value={query} onValueChange={onSearchChange} />
        <CommandList>
          <CommandEmpty>Ingen matches…</CommandEmpty>

          {/* Eksempel-gruppe: Brand (dum liste – udskift med dine rigtige brands om lidt) */}
          <CommandGroup heading="Brand">
            {['all', 'brand-a', 'brand-b'].map((b) => (
              <CommandItem key={b} onSelect={() => emit({ brandId: b })}>
                <span className={cn(safeFilters.brandId === b && 'font-semibold')}>
                  {b === 'all' ? 'All brands' : b}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          {/* Locations (filtreret efter brand + søgning) */}
          {!hideLocations && (
            <CommandGroup heading="Locations">
              {visibleLocations
                .filter((l) => l.name.toLowerCase().includes(normalizedQuery))
                .map((l) => (
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
          )}
        </CommandList>
      </Command>
    </div>
  )
}
