'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { deleteClubCampaignAction } from './club-campaign-actions';

export type ClubOverviewRow = {
  brandId: string; brandName: string; createdAt: number | null;
  type: 'club' | 'newsletter' | 'newsletter_default' | 'none';
  // null: no permission to see discounts; '' : none active for the campaign type.
  discount: string | null; live: boolean;
  omnisend: 'active' | 'inactive' | null;
  canEdit: boolean; canDelete: boolean; version: number;
};
type Filter = 'all' | 'live' | 'not_live';

const TYPE_LABELS: Record<ClubOverviewRow['type'], string> = {
  club: 'Club', newsletter: 'Nyhedsbrev', newsletter_default: 'Nyhedsbrev (standard)', none: '—',
};
const date = (epoch: number | null) => epoch === null ? '—' : formatInTimeZone(epoch, 'Europe/Copenhagen', 'dd-MM-yyyy');
const deleteError = (code: string) => code === 'campaign_changed' ? 'Kampagnen er ændret af en anden. Genindlæs siden, og prøv igen.'
  : code === 'forbidden' || code === 'unauthorized' ? 'Du har ikke adgang til at slette kampagnen for dette brand.'
    : code === 'campaign_invalid' ? 'Den gemte kampagne kan ikke læses. Kontakt en administrator.' : 'Kampagnen kunne ikke slettes. Prøv igen.';
const iconClass = 'inline-flex h-9 w-9 items-center justify-center rounded-md border';

export function ClubOverview({ rows, showOmnisend }: { rows: ClubOverviewRow[]; showOmnisend: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<Filter>('all');
  const [target, setTarget] = useState<ClubOverviewRow | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const counts = { all: rows.length, live: rows.filter(row => row.live).length, not_live: rows.filter(row => !row.live).length };
  const visible = useMemo(() => rows.filter(row => (filter === 'all' || (filter === 'live') === row.live)
    && row.brandName.toLocaleLowerCase('da').includes(query.trim().toLocaleLowerCase('da'))), [rows, filter, query]);
  const newMerchants = rows.filter(row => row.canEdit && (row.type === 'none' || row.type === 'newsletter_default'));

  async function confirmDelete() {
    if (!target || busy) return;
    setBusy(true); setError('');
    // A failed request (network, redeploy) must not leave the dialog stuck.
    const result = await deleteClubCampaignAction({ brandId: target.brandId, version: target.version })
      .catch(() => ({ ok: false as const, error: 'unavailable' }));
    setBusy(false);
    if (!result.ok) { setError(deleteError(result.error)); return; }
    setMessage(`Kampagnen for ${target.brandName} er slettet.`);
    setTarget(null);
    router.refresh();
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Club &amp; nyhedsbrev</h1>
        <p className="text-muted-foreground">Tilmeldingskampagne i checkout pr. merchant.</p>
      </div>
      {newMerchants.length > 0 && <DropdownMenu>
        <DropdownMenuTrigger asChild><Button><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Ny kampagne</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Vælg merchant</DropdownMenuLabel>
          {newMerchants.map(row => <DropdownMenuItem key={row.brandId} asChild>
            <Link href={`/superadmin/loyalty/club/${encodeURIComponent(row.brandId)}#checkout`}>{row.brandName}</Link>
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>

    {message && <p role="status" className="rounded-md border bg-white p-3 text-sm">{message}</p>}

    <section aria-label="Kampagner" className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Søg merchant</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" placeholder="Søg merchant" value={query} onChange={event => setQuery(event.target.value)} className="pl-9" />
        </label>
        <div role="group" aria-label="Filtrér på status" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {([['all', 'Alle'], ['live', 'Live'], ['not_live', 'Ikke live']] as const).map(([key, label]) =>
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
              className={cn('rounded-md px-3 py-1.5 text-sm', filter === key ? 'bg-white font-semibold shadow-sm' : 'text-muted-foreground')}>
              {label} · {counts[key]}
            </button>)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Dato</th>
              <th scope="col" className="px-4 py-3 font-semibold">Merchant</th>
              <th scope="col" className="px-4 py-3 font-semibold">Type</th>
              <th scope="col" className="px-4 py-3 font-semibold">Rabat</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              {showOmnisend && <th scope="col" className="px-4 py-3 font-semibold">Omnisend</th>}
              <th scope="col" className="px-4 py-3 text-right font-semibold">Handlinger</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(row => <tr key={row.brandId} className="border-t">
              <td className="px-4 py-3 text-muted-foreground">{date(row.createdAt)}</td>
              <th scope="row" className="px-4 py-3 text-left font-semibold">
                <Link href={`/superadmin/loyalty/club/${encodeURIComponent(row.brandId)}`} className="hover:underline">{row.brandName}</Link>
              </th>
              <td className="px-4 py-3">{TYPE_LABELS[row.type]}</td>
              <td className="px-4 py-3">{row.discount === null ? <span className="text-muted-foreground">Ingen adgang</span> : row.discount || <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-3">
                <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', row.live ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground')}>
                  {row.live ? 'Live' : 'Ikke live'}
                </span>
              </td>
              {showOmnisend && <td className={cn('px-4 py-3', row.omnisend === 'active' ? 'text-green-800' : 'text-muted-foreground')}>{row.omnisend === 'active' ? 'Aktiv' : 'Ikke aktiv'}</td>}
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Link href={`/superadmin/loyalty/club/${encodeURIComponent(row.brandId)}`} aria-label={`Vis ${row.brandName}`} title="Vis" className={iconClass}><Eye className="h-4 w-4" aria-hidden="true" /></Link>
                  {row.canEdit && <Link href={`/superadmin/loyalty/club/${encodeURIComponent(row.brandId)}#checkout`} aria-label={`Rediger ${row.brandName}`} title="Rediger"
                    className={cn(iconClass, 'border-primary bg-primary text-primary-foreground')}><Pencil className="h-4 w-4" aria-hidden="true" /></Link>}
                  {row.canDelete && <button type="button" aria-label={`Slet kampagnen for ${row.brandName}`} title="Slet kampagne" onClick={() => { setError(''); setMessage(''); setTarget(row); }}
                    className={cn(iconClass, 'border-destructive/40 text-destructive')}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
                </div>
              </td>
            </tr>)}
            {!visible.length && <tr><td colSpan={showOmnisend ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">Ingen merchants matcher.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <AlertDialog open={target !== null} onOpenChange={open => { if (!open && !busy) setTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Slet kampagnen for {target?.brandName}?</AlertDialogTitle>
          <AlertDialogDescription>Checkout viser ikke længere tilmelding, og velkomst- og profilstempler slås fra. Kampagnen starter forfra, hvis den oprettes igen.</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1 rounded-md bg-muted/50 py-3 pl-8 pr-4 text-sm">
          <li>Medlemmer og stempelkort bevares</li>
          <li>Samtykker til nyhedsbrev bevares</li>
          <li>Rabatter, kunder allerede har fået, kan stadig bruges</li>
        </ul>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annullér</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={() => void confirmDelete()}>{busy ? 'Sletter…' : 'Slet kampagne'}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
