'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createGameCampaign } from '@/app/superadmin/games/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function CreateCampaignButton({ brands }: { brands: { id: string; name: string; hasBase: boolean }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [brandId, setBrandId] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const brand = brands.find(item => item.id === brandId);
    if (!brand) { setError('Vælg et brand.'); return; }
    setError('');
    if (!brand.hasBase) {
      router.push(`/superadmin/games/scratch-card?brand=${encodeURIComponent(brand.id)}`);
      return;
    }
    start(async () => {
      const result = await createGameCampaign(brand.id);
      if (result.ok && result.id) router.push(`/superadmin/games/scratch-card?brand=${encodeURIComponent(brand.id)}&campaign=${encodeURIComponent(result.id)}`);
      else setError(result.message);
    });
  }

  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { setBrandId(''); setError(''); } }}>
    <DialogTrigger asChild><Button disabled={!brands.length}><Plus className="mr-2 h-4 w-4" aria-hidden="true"/>Opret spil</Button></DialogTrigger>
    <DialogContent className="max-w-md rounded-lg p-6">
      <DialogHeader><DialogTitle>Opret spil</DialogTitle><DialogDescription>Vælg det brand, som spillet skal tilhøre. Brandet kan ikke ændres senere.</DialogDescription></DialogHeader>
      <form onSubmit={create} className="mt-5 space-y-5">
        <label className="grid gap-2 text-sm font-medium" htmlFor="game-create-brand">Brand
          <select id="game-create-brand" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={brandId} onChange={event => { setBrandId(event.target.value); setError(''); }}>
            <option value="">Vælg brand</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuller</Button><Button type="submit" disabled={pending || !brandId}>{pending ? 'Opretter…' : 'Fortsæt'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
