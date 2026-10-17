'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { useToast } from '@/hooks/use-toast';
import type { EventRow } from '@/lib/loyalty/stamp-card/admin';
import { CHANNEL_LABELS, downloadCsv, EVENT_LABELS, formatDateTime, formatKr, SOURCE_LABELS } from '@/lib/loyalty/stamp-card/csv';
import { exportEvents } from './actions';

type Filter = { brandIds: string[]; from: string; to: string; type: string | null; actorId: string | null; channel: string | null };

// The log is append-only: there are no edit or delete controls.
export function EventLog({ rows, truncated, filter, multiBrand }: { rows: EventRow[]; truncated: boolean; filter: Filter; multiBrand: boolean }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams(), [pending, start] = useTransition(), { toast } = useToast();
  const setType = (type: string) => { const next = new URLSearchParams(params); if (type) next.set('type', type); else next.delete('type'); router.replace(`${pathname}?${next}`, { scroll: false }); };
  const exportCsv = () => start(async () => {
    const result = await exportEvents(filter);
    if (!result.ok || !result.data) { toast({ variant: 'destructive', title: 'Eksporten mislykkedes' }); return; }
    downloadCsv(`stempelkort-log-${filter.from}-${filter.to}.csv`, [
      ['Tidspunkt', 'Hændelse', 'Medlem', 'Antal', 'Beløb', 'Kanal', 'Kilde', 'Afdeling', 'Medarbejder', 'Årsag', 'Ændringer'],
      ...result.data.rows.map(r => [formatDateTime(r.createdAt), EVENT_LABELS[r.type] ?? r.type, r.memberName, r.quantity, formatKr(r.amountOre),
        r.channel ? CHANNEL_LABELS[r.channel] ?? r.channel : '', SOURCE_LABELS[r.source] ?? r.source, r.locationName ?? '', r.actorName ?? '', r.reason ?? '', r.details ?? '']),
    ]);
  });
  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-semibold">Log</h2><p className="text-sm text-muted-foreground">{rows.length} hændelser · {filter.from} til {filter.to}</p></div>
        <div className="flex items-end gap-2">
          <AdminSelectField label="Type" value={filter.type ?? ''} onChange={e => setType(e.target.value)}>
            <option value="">Alle typer</option>
            {Object.entries(EVENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </AdminSelectField>
          <Button variant="outline" onClick={exportCsv} disabled={pending}>Eksportér CSV</Button>
        </div>
      </div>
      {truncated && <p role="status" className="rounded-md bg-amber-50 p-3 text-sm">Perioden har flere end 5.000 hændelser pr. brand. Vælg en kortere periode.</p>}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Tidspunkt</TableHead><TableHead>Hændelse</TableHead><TableHead>Medlem</TableHead><TableHead>Antal · beløb</TableHead>
            <TableHead>Kanal · kilde</TableHead><TableHead>Afdeling</TableHead><TableHead>Medarbejder</TableHead><TableHead>Årsag · ændringer</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                <TableCell>{EVENT_LABELS[r.type] ?? r.type}</TableCell>
                <TableCell>{r.memberName || '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{r.quantity || '—'}{r.amountOre != null ? ` · ${formatKr(r.amountOre)}` : ''}</TableCell>
                <TableCell>{[r.channel ? CHANNEL_LABELS[r.channel] ?? r.channel : null, SOURCE_LABELS[r.source] ?? r.source].filter(Boolean).join(' · ')}</TableCell>
                <TableCell>{r.locationName ?? '—'}</TableCell>
                <TableCell>{r.actorName ?? '—'}</TableCell>
                <TableCell className="max-w-md break-words">{[r.reason, r.details].filter(Boolean).join(' · ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length && <p className="py-10 text-center text-sm text-muted-foreground">Ingen hændelser i perioden.</p>}
      </div>
      {multiBrand && <p className="text-xs text-muted-foreground">Loggen omfatter alle valgte brands.</p>}
    </section>
  );
}
