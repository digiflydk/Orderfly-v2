'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type SyncSource = 'omnisend' | 'bookings';
type SyncProgress = { pages: number; fetched: number; imported: number; skipped: number; conflicts: number };

export function CustomerSyncActions({ brands }: { brands: Array<{ id: string; name: string }> }) {
  const [brandId, setBrandId] = useState('');
  const [busy, setBusy] = useState<SyncSource | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const selectedBrandName = brands.find(brand => brand.id === brandId)?.name;

  const sync = async (source: SyncSource) => {
    if (!brandId || busy) return;
    const progress: SyncProgress = { pages: 0, fetched: 0, imported: 0, skipped: 0, conflicts: 0 };
    let hasMore = source === 'omnisend';
    let bookingMessage = '';
    let failureMessage: string | null = null;
    setBusy(source);
    setSyncProgress(source === 'omnisend' ? progress : null);
    try {
      do {
        const response = await fetch('/api/superadmin/customers/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, source }),
        });
        const payload = await response.json().catch(() => null);
        const result = payload && typeof payload === 'object' && !Array.isArray(payload)
          ? payload as Record<string, unknown>
          : null;
        if (!response.ok) {
          const reason = typeof result?.error === 'string' ? result.error : 'Prøv igen om lidt.';
          const code = typeof result?.code === 'string' ? ` (fejlkode: ${result.code})` : '';
          failureMessage = reason + code;
          break;
        }
        if (!result) {
          failureMessage = 'Serveren returnerede et ugyldigt svar.';
          break;
        }
        if (source === 'omnisend') {
          const pageCounts = [result.fetched, result.imported, result.skipped, result.conflicts];
          if (typeof result.hasMore !== 'boolean'
            || pageCounts.some(value => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) {
            failureMessage = 'Omnisend returnerede et ugyldigt sidesvar.';
            break;
          }
          progress.pages++;
          progress.fetched += result.fetched as number;
          progress.imported += result.imported as number;
          progress.skipped += result.skipped as number;
          progress.conflicts += result.conflicts as number;
          hasMore = result.hasMore;
          setSyncProgress({ ...progress });
        } else {
          bookingMessage = typeof result.message === 'string' ? result.message : 'Synkronisering gennemført.';
          hasMore = false;
        }
      } while (source === 'omnisend' && hasMore);

      if (failureMessage) {
        if (progress.pages > 0) router.refresh();
        const partial = source === 'omnisend' && progress.pages > 0;
        const description = partial
          ? `${progress.fetched} kontakter læst, ${progress.imported} importeret eller opdateret, ${progress.skipped} udeladt, ${progress.conflicts} identitetskonflikter. Færdige sider er gemt; tryk Synk Omnisend igen for at fortsætte. ${failureMessage}`
          : failureMessage;
        toast({
          variant: 'destructive',
          title: partial ? 'Synkronisering stoppede' : 'Synkronisering kunne ikke startes',
          description,
        });
        return;
      }

      const description = source === 'omnisend'
        ? `Import færdig: ${progress.fetched} kontakter læst, ${progress.imported} importeret eller opdateret, ${progress.skipped} udeladt, ${progress.conflicts} identitetskonflikter.`
        : bookingMessage;
      toast({
        title: source === 'omnisend' ? 'Omnisend synkroniseret' : 'Bordbookinger synkroniseret',
        description,
      });
      router.refresh();
    } catch {
      if (progress.pages > 0) router.refresh();
      const partial = source === 'omnisend' && progress.pages > 0;
      const description = partial
        ? `${progress.fetched} kontakter læst, ${progress.imported} importeret eller opdateret, ${progress.skipped} udeladt, ${progress.conflicts} identitetskonflikter. Færdige sider er gemt; tryk Synk Omnisend igen for at fortsætte.`
        : 'Forbindelsen blev afbrudt. Prøv igen om lidt.';
      toast({
        variant: 'destructive',
        title: partial ? 'Synkronisering stoppede' : 'Synkronisering fejlede',
        description,
      });
    } finally {
      setBusy(null);
      setSyncProgress(null);
    }
  };

  return <section aria-label="Manuel kundesynkronisering" className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="space-y-1">
      <h2 className="text-sm font-semibold">Manuel synkronisering</h2>
      <p className="text-sm text-muted-foreground">Vælg ét brand. Synkronisering importerer kundedata, men sender ikke kampagner.</p>
    </div>
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <label htmlFor="customer-sync-brand" className="text-xs font-medium text-muted-foreground">Brand til synkronisering</label>
          <Select value={brandId} onValueChange={setBrandId} disabled={!!busy}>
            <SelectTrigger id="customer-sync-brand" aria-label="Brand til synkronisering" className="w-full sm:w-56">
              <SelectValue placeholder="Vælg brand" />
            </SelectTrigger>
            <SelectContent>
              {brands.map(brand => <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" disabled={!brandId || !!busy} aria-busy={busy === 'omnisend'} onClick={() => void sync('omnisend')}>
          {busy === 'omnisend' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Synk Omnisend
        </Button>
        <Button variant="outline" disabled={!brandId || !!busy} aria-busy={busy === 'bookings'} onClick={() => void sync('bookings')}>
          {busy === 'bookings' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Synk bordbookinger
        </Button>
      </div>
      {busy && (
        <div role="status" aria-live="polite" aria-atomic="true" className="flex items-center gap-2 text-sm text-muted-foreground sm:self-end">
          <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
          <span>
            Synkroniserer {busy === 'omnisend' ? 'Omnisend-kontakter' : 'bordbookinger'}
            {selectedBrandName ? ` for ${selectedBrandName}` : ''}…
            {busy === 'omnisend' && syncProgress?.pages
              ? ` ${syncProgress.pages} sider hentet, ${syncProgress.fetched} kontakter læst.`
              : ''}
          </span>
        </div>
      )}
    </div>
  </section>;
}
