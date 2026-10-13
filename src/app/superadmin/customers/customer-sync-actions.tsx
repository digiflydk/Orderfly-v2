'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type SyncSource = 'omnisend' | 'bookings';

export function CustomerSyncActions({ brands }: { brands: Array<{ id: string; name: string }> }) {
  const [brandId, setBrandId] = useState('');
  const [busy, setBusy] = useState<SyncSource | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const sync = async (source: SyncSource) => {
    if (!brandId || busy) return;
    setBusy(source);
    try {
      const response = await fetch('/api/superadmin/customers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, source }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast({ variant: 'destructive', title: 'Synkronisering kunne ikke startes', description: result.error || 'Prøv igen om lidt.' });
        return;
      }
      toast({ title: source === 'omnisend' ? 'Omnisend synkroniseret' : 'Bordbookinger synkroniseret', description: result.message });
      router.refresh();
    } catch {
      toast({ variant: 'destructive', title: 'Synkronisering fejlede', description: 'Forbindelsen blev afbrudt. Prøv igen om lidt.' });
    } finally {
      setBusy(null);
    }
  };

  return <section aria-label="Manuel kundesynkronisering" className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="space-y-1">
      <h2 className="text-sm font-semibold">Manuel synkronisering</h2>
      <p className="text-sm text-muted-foreground">Vælg ét brand. Synkronisering importerer kundedata, men sender ikke kampagner.</p>
    </div>
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
  </section>;
}
