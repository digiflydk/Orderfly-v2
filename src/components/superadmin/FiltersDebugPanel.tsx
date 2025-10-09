'use client'

import { useSAFilters } from '@/hooks/use-sa-filters'

export default function FiltersDebugPanel() {
  const { filters } = useSAFilters()
  return (
    <pre className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md overflow-auto">
      {JSON.stringify(filters, null, 2)}
    </pre>
  )
}
