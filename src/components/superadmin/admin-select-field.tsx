'use client'

import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Props = SelectHTMLAttributes<HTMLSelectElement> & { label: string }

/** Native select for simple admin filters; complex lists use the styled Radix Select. */
export function AdminSelectField({ label, className, children, ...props }: Props) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      <span>{label}</span>
      <select className={cn('h-10 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} {...props}>
        {children}
      </select>
    </label>
  )
}
