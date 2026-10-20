'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { useToast } from '@/hooks/use-toast';
import type { ProgramRow } from '@/lib/loyalty/stamp-card/admin';
import { formatDateTime } from '@/lib/loyalty/stamp-card/csv';
import { setProgramActiveAction } from './actions';

export type ProgramStatus = 'all' | 'active' | 'inactive';
const ERRORS: Record<string, string> = {
  settings_incomplete: 'Udfyld indstillingerne (belønning, vilkår og samtykketekst), før programmet aktiveres.',
  texts_incomplete: 'Teksterne mangler oplysninger, fx CVR-nr. eller kontakt-e-mail. Åbn indstillingerne for at se, hvad der mangler.',
  texts_invalid: 'Teksterne indeholder en ukendt pladsholder. Ret dem under indstillingerne.',
  invalid_reward_reference: 'Et produkt eller en kategori i belønningen findes ikke længere. Ret belønningen under Rediger.',
  record_changed: 'Programmet er ændret af en anden. Siden er opdateret; prøv igen.',
  forbidden: 'Du har ikke adgang til at ændre dette program.',
};

// Created stamp cards with status, members and quick activation. A stamp card
// is created per brand only on request, from the brands without one.
export function ProgramsOverview({ rows, available, status, editHref }: {
  rows: ProgramRow[]; available: Array<{ brandId: string; brandName: string }>; status: ProgramStatus; editHref: string;
}) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams(), { toast } = useToast();
  const [pending, setPending] = useState(false), [confirm, setConfirm] = useState<ProgramRow | null>(null), [create, setCreate] = useState('');
  const edit = (brandId: string) => `${editHref}&edit=${encodeURIComponent(brandId)}`;
  const visible = rows.filter(r => status === 'all' || (status === 'active') === r.active);

  const setStatus = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('status'); else next.set('status', value);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  // Explicit in-flight state keeps the dialog disabled until the server action settles.
  const toggle = async (row: ProgramRow) => {
    setPending(true);
    const result = await setProgramActiveAction({ brandId: row.brandId, version: row.version, active: !row.active })
      .catch(() => ({ ok: false as const, error: 'unavailable' }));
    setPending(false);
    setConfirm(null);
    if (result.ok) toast({ title: row.active ? `${row.name} er deaktiveret` : `${row.name} er aktiveret` });
    else toast({ variant: 'destructive', title: row.active ? 'Programmet blev ikke deaktiveret' : 'Programmet blev ikke aktiveret', description: ERRORS[result.error] ?? 'Prøv igen.' });
    router.refresh();
  };

  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">Stempelkort</h2>
          <p className="text-sm text-muted-foreground">{visible.length} af {rows.length} stempelkort</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <AdminSelectField label="Status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">Alle</option>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
          </AdminSelectField>
          {available.length > 0 && (
            <div className="flex items-end gap-2">
              <AdminSelectField label="Opret for brand" value={create} onChange={e => setCreate(e.target.value)}>
                <option value="">Vælg brand</option>
                {available.map(b => <option key={b.brandId} value={b.brandId}>{b.brandName}</option>)}
              </AdminSelectField>
              <Button disabled={!create} onClick={() => router.push(edit(create))}><Plus className="mr-1 h-4 w-4" />Opret stempelkort</Button>
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead><TableHead>Program</TableHead><TableHead>Status</TableHead>
              <TableHead>Medlemmer</TableHead><TableHead>Sidst ændret</TableHead><TableHead className="text-right">Handlinger</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(r => (
              <TableRow key={r.brandId}>
                <TableCell><div className="font-medium">{r.brandName}</div><div className="text-xs text-muted-foreground">{r.companyName}</div></TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell><Badge variant={r.active ? 'default' : 'outline'}>{r.active ? 'Aktiv' : 'Inaktiv'}</Badge></TableCell>
                <TableCell>{r.members}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDateTime(r.updatedAt)}{r.updatedByName && <div className="text-xs text-muted-foreground">{r.updatedByName}</div>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="outline" size="sm"><Link href={edit(r.brandId)}>Rediger</Link></Button>
                    <Button variant={r.active ? 'outline' : 'default'} size="sm" disabled={pending} onClick={() => setConfirm(r)}>{r.active ? 'Deaktivér' : 'Aktivér'}</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!visible.length && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {rows.length ? 'Ingen stempelkort matcher.' : 'Der er endnu ikke oprettet stempelkort. Vælg et brand og tryk Opret stempelkort.'}
          </p>
        )}
      </div>
      <AlertDialog open={!!confirm} onOpenChange={open => { if (!open && !pending) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.active ? `Deaktivér ${confirm?.name}?` : `Aktivér ${confirm?.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.active
                ? 'Kunder kan hverken optjene stempler, tilmelde sig eller indløse belønninger, før programmet aktiveres igen. Stempler og belønninger bevares.'
                : 'Kunder kan tilmelde sig, optjene stempler og indløse belønninger med de gemte indstillinger.'}
              {!confirm?.active && confirm?.termsChanged && ' Vilkårene er ændret siden sidst og udgives som en ny version. Væsentlige ændringer kræver 30 dages varsel til medlemmerne (vilkårenes afsnit 10).'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Annullér</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={event => { event.preventDefault(); if (confirm && !pending) void toggle(confirm); }}>
              {confirm?.active ? 'Deaktivér' : 'Aktivér'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
