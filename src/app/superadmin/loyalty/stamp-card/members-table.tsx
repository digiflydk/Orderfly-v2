'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import type { MemberRow } from '@/lib/loyalty/stamp-card/admin';
import { downloadCsv, formatDate, formatDateTime } from '@/lib/loyalty/stamp-card/csv';
import { exportMembers } from './actions';

type SortKey = 'name' | 'joinedAt' | 'stamps' | 'rewards' | 'nextExpiry' | 'lastActivityAt';
const COLUMNS: Array<[SortKey | null, string]> = [['name', 'Medlem'], ['joinedAt', 'Tilmeldt'], ['stamps', 'Stempler'], ['rewards', 'Belønninger'],
  ['nextExpiry', 'Næste udløb'], [null, 'Nyhedsbrev'], ['lastActivityAt', 'Seneste aktivitet']];

export function MembersTable({ rows, truncated, brandIds, filterQuery, multiBrand }: { rows: MemberRow[]; truncated: boolean; brandIds: string[]; filterQuery: string; multiBrand: boolean }) {
  const [search, setSearch] = useState(''), [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'joinedAt', desc: true });
  const [pending, start] = useTransition(), { toast } = useToast();
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('da-DK');
    const value = (row: MemberRow) => sort.key === 'name' ? row.name.toLocaleLowerCase('da-DK') : row[sort.key] ?? (sort.desc ? -Infinity : Infinity);
    return rows.filter(r => !term || `${r.name} ${r.email}`.toLocaleLowerCase('da-DK').includes(term))
      .sort((a, b) => { const x = value(a), y = value(b); return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1); });
  }, [rows, search, sort]);

  // Exports every member in the filter, re-read on the server with the same permission check.
  const exportCsv = () => start(async () => {
    const result = await exportMembers(brandIds);
    if (!result.ok || !result.data) { toast({ variant: 'destructive', title: 'Eksporten mislykkedes' }); return; }
    downloadCsv(`stempelkort-medlemmer-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Brand', 'Navn', 'E-mail', 'Tilmeldt', 'Stempler', 'Stempler til belønning', 'Optjente belønninger', 'Næste udløb', 'Nyhedsbrev', 'Seneste aktivitet'],
      ...result.data.rows.map(r => [r.brandName, r.name, r.email, formatDate(r.joinedAt), r.stamps, r.stampsRequired, r.rewards, formatDate(r.nextExpiry), r.newsletter ? 'Tilmeldt' : 'Afmeldt', formatDateTime(r.lastActivityAt)]),
    ]);
    if (result.data.truncated) toast({ variant: 'destructive', title: 'Eksporten er ufuldstændig', description: 'Filen indeholder de første 50.000 medlemmer pr. brand.' });
  });

  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold">Medlemmer</h2><p className="text-sm text-muted-foreground">{visible.length} af {rows.length} aktive medlemmer</p></div>
        <div className="flex gap-2">
          <Input aria-label="Søg på navn eller e-mail" placeholder="Søg navn eller e-mail" value={search} onChange={e => setSearch(e.target.value)} className="sm:w-72" />
          <Button variant="outline" onClick={exportCsv} disabled={pending}>Eksportér CSV</Button>
        </div>
      </div>
      {truncated && <p role="status" className="rounded-md bg-amber-50 p-3 text-sm">Listen viser de første 5.000 medlemmer pr. brand. Brug søgning, eller eksportér alle medlemmer som CSV.</p>}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {multiBrand && <TableHead>Brand</TableHead>}
              {COLUMNS.map(([key, label]) => (
                <TableHead key={label} aria-sort={key && sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                  {key ? <button type="button" className="font-medium" onClick={() => setSort(prev => ({ key, desc: prev.key === key ? !prev.desc : true }))}>{label}</button> : label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(r => (
              <TableRow key={r.id}>
                {multiBrand && <TableCell>{r.brandName}</TableCell>}
                <TableCell><Link className="font-medium underline-offset-2 hover:underline" href={`/superadmin/loyalty/stamp-card/members/${r.id}?${filterQuery}`}>{r.name}</Link><div className="text-xs text-muted-foreground">{r.email}</div></TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(r.joinedAt)}</TableCell>
                <TableCell>{r.stamps}/{r.stampsRequired}</TableCell>
                <TableCell>{r.rewards}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(r.nextExpiry)}</TableCell>
                <TableCell><Badge variant={r.newsletter ? 'default' : 'outline'}>{r.newsletter ? 'Tilmeldt' : 'Afmeldt'}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">{formatDateTime(r.lastActivityAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!visible.length && <p className="py-10 text-center text-sm text-muted-foreground">Ingen medlemmer matcher.</p>}
      </div>
    </section>
  );
}
