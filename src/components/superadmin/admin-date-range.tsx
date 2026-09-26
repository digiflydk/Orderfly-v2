'use client'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Props = {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  className?: string
  disabled?: boolean
  fromLabel?: string
  toLabel?: string
  groupLabel?: string
}

/** The shared admin date filter. Callers own submission and validation. */
export function AdminDateRange({ from, to, onFromChange, onToChange, className, disabled, fromLabel = 'Fra dato', toLabel = 'Til dato', groupLabel = 'Datointerval' }: Props) {
  return (
    <div className={cn('admin-date-range grid gap-3 sm:grid-cols-2', className)} role="group" aria-label={groupLabel}>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">
        <span>{fromLabel}</span>
        <Input type="date" value={from} max={to || undefined} disabled={disabled} onChange={event => onFromChange(event.target.value)} />
      </label>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">
        <span>{toLabel}</span>
        <Input type="date" value={to} min={from || undefined} disabled={disabled} onChange={event => onToChange(event.target.value)} />
      </label>
    </div>
  )
}
